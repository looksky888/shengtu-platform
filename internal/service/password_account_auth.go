package service

import (
	"chatgpt2api/internal/util"
	"errors"
	"fmt"
	"strings"
)

func (s *AuthService) EnsureBootstrapAdmin(username, password string) (BootstrapAdminResult, error) {
	username, err := normalizeAccountUsername(username)
	if err != nil {
		return BootstrapAdminResult{}, err
	}
	password = strings.TrimSpace(password)
	generated := false
	if password == "" {
		password = util.RandomTokenURL(12)
		generated = true
	}
	if err := validateAccountPassword(password); err != nil {
		return BootstrapAdminResult{}, err
	}

	s.mu.RLock()
	for _, account := range s.accounts {
		if account.Role == AuthRoleAdmin {
			s.mu.RUnlock()
			return BootstrapAdminResult{Username: account.Username}, nil
		}
	}
	if _, ok := passwordAccountByUsernameLocked(s.accounts, username); ok {
		s.mu.RUnlock()
		return BootstrapAdminResult{}, fmt.Errorf("管理员用户名已存在")
	}
	s.mu.RUnlock()

	hash, err := hashAccountPassword(password)
	if err != nil {
		return BootstrapAdminResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, account := range s.accounts {
		if account.Role == AuthRoleAdmin {
			return BootstrapAdminResult{Username: account.Username}, nil
		}
	}
	if _, ok := passwordAccountByUsernameLocked(s.accounts, username); ok {
		return BootstrapAdminResult{}, fmt.Errorf("管理员用户名已存在")
	}
	now := util.NowISO()
	account := PasswordAccount{
		ID:           AuthRoleAdmin,
		Username:     username,
		Name:         "管理员",
		PasswordHash: hash,
		Role:         AuthRoleAdmin,
		Enabled:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	s.accounts = append(s.accounts, account)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		return BootstrapAdminResult{}, authRollbackError(err, s.savePasswordAccountsLocked())
	}
	return BootstrapAdminResult{Created: true, Generated: generated, Username: username, Password: password}, nil
}

func (s *AuthService) RegisterPasswordUser(username, password, name string) (*Identity, string, error) {
	return s.RegisterPasswordUserWithRemember(username, password, name, false)
}

func (s *AuthService) RegisterPasswordUserWithRemember(username, password, name string, rememberMe bool) (*Identity, string, error) {
	username, err := normalizeAccountUsername(username)
	if err != nil {
		return nil, "", err
	}
	if err := validateAccountPassword(password); err != nil {
		return nil, "", err
	}
	name = normalizeAccountDisplayName(name, username)
	hash, err := hashAccountPassword(password)
	if err != nil {
		return nil, "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := passwordAccountByUsernameLocked(s.accounts, username); ok {
		return nil, "", authError("用户名已存在")
	}
	now := util.NowISO()
	account := PasswordAccount{
		ID:           "user_" + util.NewHex(12),
		Username:     username,
		Name:         name,
		PasswordHash: hash,
		Role:         AuthRoleUser,
		RoleID:       DefaultManagedRoleID,
		Enabled:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	previousItems := append([]AuthKey(nil), s.items...)
	s.accounts = append(s.accounts, account)
	item, raw, mutated := s.issuePasswordSessionLocked(account, now, rememberMe)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.persistAuthKeysLocked(mutated); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return nil, "", authRollbackError(err, rollbackErr)
	}
	return identityForAuthItem(item), raw, nil
}

// RegisterEmailUser creates a 3.7 public account. Username remains an internal
// stable identifier; users authenticate this account by verified email only.
func (s *AuthService) RegisterEmailUser(email, password, name string) (*Identity, string, error) {
	return s.RegisterEmailUserWithRemember(email, password, name, false)
}

func (s *AuthService) RegisterEmailUserWithRemember(email, password, name string, rememberMe bool) (*Identity, string, error) {
	email, err := normalizeAccountEmail(email)
	if err != nil {
		return nil, "", err
	}
	if err := validateAccountPassword(password); err != nil {
		return nil, "", err
	}
	hash, err := hashAccountPassword(password)
	if err != nil {
		return nil, "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, _, ok := passwordAccountIndexByEmailLocked(s.accounts, email); ok {
		return nil, "", authError("邮箱已注册")
	}
	username := newEmailAccountUsernameLocked(s.accounts)
	name = normalizeAccountDisplayName(name, strings.SplitN(email, "@", 2)[0])
	now := util.NowISO()
	account := PasswordAccount{
		ID:              "user_" + util.NewHex(12),
		Username:        username,
		Email:           email,
		EmailVerifiedAt: now,
		Name:            name,
		PasswordHash:    hash,
		Role:            AuthRoleUser,
		RoleID:          DefaultManagedRoleID,
		Enabled:         true,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	previousItems := append([]AuthKey(nil), s.items...)
	s.accounts = append(s.accounts, account)
	item, raw, mutated := s.issuePasswordSessionLocked(account, now, rememberMe)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.persistAuthKeysLocked(mutated); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return nil, "", authRollbackError(err, rollbackErr)
	}
	return identityForAuthItem(item), raw, nil
}

func newEmailAccountUsernameLocked(accounts []PasswordAccount) string {
	for {
		candidate := "u_" + strings.ToLower(util.NewHex(10))
		if _, ok := passwordAccountByUsernameLocked(accounts, candidate); !ok {
			return candidate
		}
	}
}

func (s *AuthService) EmailExists(email string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, _, ok := passwordAccountIndexByEmailLocked(s.accounts, email)
	return ok
}

func (s *AuthService) CreatePasswordUser(username, password, name, roleID string, enabled bool) (ManagedUserPublic, error) {
	username, err := normalizeAccountUsername(username)
	if err != nil {
		return ManagedUserPublic{}, err
	}
	if err := validateAccountPassword(password); err != nil {
		return ManagedUserPublic{}, err
	}
	name = normalizeAccountDisplayName(name, username)
	roleID = util.Clean(roleID)
	if roleID == "" {
		roleID = DefaultManagedRoleID
	}
	hash, err := hashAccountPassword(password)
	if err != nil {
		return ManagedUserPublic{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := passwordAccountByUsernameLocked(s.accounts, username); ok {
		return ManagedUserPublic{}, authError("用户名已存在")
	}
	role, ok := managedRoleByIDLocked(s.roles, roleID)
	if !ok {
		return ManagedUserPublic{}, authError("角色不存在")
	}
	now := util.NowISO()
	account := PasswordAccount{
		ID:           "user_" + util.NewHex(12),
		Username:     username,
		Name:         name,
		PasswordHash: hash,
		Role:         AuthRoleUser,
		RoleID:       role.ID,
		Enabled:      enabled,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	s.accounts = append(s.accounts, account)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		return ManagedUserPublic{}, authRollbackError(err, s.savePasswordAccountsLocked())
	}
	user, ok := managedUserPublicByIDLocked(s.items, s.roles, s.accounts, account.ID)
	if !ok {
		return ManagedUserPublic{}, authError("创建用户后投影失败")
	}
	return user, nil
}

func (s *AuthService) LoginPassword(accountName, password string) (*Identity, string, error) {
	return s.LoginPasswordWithRemember(accountName, password, false)
}

func (s *AuthService) LoginPasswordWithRemember(accountName, password string, rememberMe bool) (*Identity, string, error) {
	accountName = strings.TrimSpace(accountName)
	byEmail := strings.Contains(accountName, "@")
	var normalizedUsername string
	var usernameErr error
	if !byEmail {
		normalizedUsername, usernameErr = normalizeAccountUsername(accountName)
	}

	// Step 1: Lookup candidate account under read lock only.
	s.mu.RLock()
	var candidate PasswordAccount
	found := false
	if byEmail {
		_, candidate, found = passwordAccountIndexByEmailLocked(s.accounts, accountName)
	} else if usernameErr == nil {
		_, candidate, found = passwordAccountIndexByUsernameLocked(s.accounts, normalizedUsername)
		if found && candidate.Email != "" {
			found = false
		}
	}
	s.mu.RUnlock()

	// Step 2: Run CPU-intensive bcrypt verification outside AuthService lock.
	if !found {
		verifyDummyAccountPassword(password)
		return nil, "", authError("账号或密码错误")
	}
	if !verifyAccountPassword(password, candidate.PasswordHash) {
		return nil, "", authError("账号或密码错误")
	}
	if !candidate.Enabled {
		return nil, "", authError("用户已被禁用")
	}

	// Step 3: Commit login timestamp and session issuance under write lock.
	s.mu.Lock()
	defer s.mu.Unlock()
	index := -1
	var account PasswordAccount
	for i, existing := range s.accounts {
		if existing.ID == candidate.ID {
			index = i
			account = existing
			break
		}
	}
	if index < 0 || account.PasswordHash != candidate.PasswordHash {
		return nil, "", authError("账号或密码错误")
	}
	if !account.Enabled {
		return nil, "", authError("用户已被禁用")
	}
	now := util.NowISO()
	previousAccounts := append([]PasswordAccount(nil), s.accounts...)
	previousItems := append([]AuthKey(nil), s.items...)
	account.LastLoginAt = now
	account.UpdatedAt = now
	s.accounts[index] = account
	item, raw, mutated := s.issuePasswordSessionLocked(account, now, rememberMe)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.persistAuthKeysLocked(mutated); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return nil, "", authRollbackError(err, rollbackErr)
	}
	return identityForAuthItem(item), raw, nil
}
