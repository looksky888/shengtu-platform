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
	hash, err := hashAccountPassword(password)
	if err != nil {
		return BootstrapAdminResult{}, err
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
	item, raw := s.issuePasswordSessionLocked(account, now)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.saveLocked(); err != nil {
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
	item, raw := s.issuePasswordSessionLocked(account, now)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.saveLocked(); err != nil {
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
	s.mu.Lock()
	defer s.mu.Unlock()
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
	accountName = strings.TrimSpace(accountName)
	s.mu.Lock()
	defer s.mu.Unlock()
	index, account, ok := -1, PasswordAccount{}, false
	if strings.Contains(accountName, "@") {
		index, account, ok = passwordAccountIndexByEmailLocked(s.accounts, accountName)
	} else if username, err := normalizeAccountUsername(accountName); err == nil {
		index, account, ok = passwordAccountIndexByUsernameLocked(s.accounts, username)
		if ok && account.Email != "" {
			ok = false
		}
	}
	if !ok || !verifyAccountPassword(password, account.PasswordHash) {
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
	item, raw := s.issuePasswordSessionLocked(account, now)
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return nil, "", authRollbackError(err, s.savePasswordAccountsLocked())
	}
	if err := s.saveLocked(); err != nil {
		s.accounts = previousAccounts
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return nil, "", authRollbackError(err, rollbackErr)
	}
	return identityForAuthItem(item), raw, nil
}
