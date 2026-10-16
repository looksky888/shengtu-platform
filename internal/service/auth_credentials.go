package service

import (
	"errors"
	"fmt"

	"chatgpt2api/internal/util"
)

func (s *AuthService) CreateAPIKey(role, name string, owner AuthOwner) (AuthKeyPublic, string, error) {
	return s.createCredential(role, AuthKindAPIKey, name, owner, "")
}

func (s *AuthService) UpsertAPIKeyForOwner(name string, owner AuthOwner) (AuthKeyPublic, string, error) {
	owner = normalizeAuthOwner(owner)
	if owner.ID == "" {
		return AuthKeyPublic{}, "", errAuthOwnerRequired()
	}
	name = util.Clean(name)
	if name == "" {
		name = "我的 API 令牌"
	}
	raw := "sk-" + util.RandomTokenURL(24)
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	previousItems := append([]AuthKey(nil), s.items...)
	nextItems := make([]AuthKey, 0, len(s.items)+1)
	var updated AuthKey
	found := false
	for _, item := range s.items {
		matchesOwnerAPIKey := util.Clean(item.Role) == AuthRoleUser &&
			util.Clean(item.Kind) == AuthKindAPIKey &&
			util.Clean(item.OwnerID) == owner.ID
		if !matchesOwnerAPIKey {
			nextItems = append(nextItems, item)
			continue
		}
		if found {
			continue
		}
		updated = item
		updated.Name = name
		updated.Provider = owner.Provider
		updated.OwnerName = owner.Name
		storeAuthSecret(&updated, raw)
		updated.Enabled = true
		updated.LastUsedAt = ""
		updated.UpdatedAt = now
		nextItems = append(nextItems, updated)
		found = true
	}
	if !found {
		updated = newAuthItem(AuthRoleUser, AuthKindAPIKey, name, owner, raw)
		if roleID, ok := managedAuthRoleIDLocked(s.items, s.accounts, owner.ID); ok {
			s.applyRoleToAuthItem(&updated, roleID)
		} else {
			s.applyRoleToAuthItem(&updated, "")
		}
		nextItems = append(nextItems, updated)
	}
	s.items = nextItems
	if err := s.saveLocked(); err != nil {
		s.items = previousItems
		return AuthKeyPublic{}, "", err
	}
	return AuthKeyPublicFromRecord(updated), raw, nil
}

func (s *AuthService) UpsertPersonalAPIKey(identity Identity, name string) (AuthKeyPublic, string, error) {
	role, owner, ok := personalAPIKeyScope(identity)
	if !ok {
		return AuthKeyPublic{}, "", errAuthOwnerRequired()
	}
	name = util.Clean(name)
	if name == "" {
		name = "我的 API 令牌"
	}
	raw := "sk-" + util.RandomTokenURL(24)
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	previousItems := append([]AuthKey(nil), s.items...)
	nextItems := make([]AuthKey, 0, len(s.items)+1)
	var updated AuthKey
	found := false
	for _, item := range s.items {
		matchesPersonalAPIKey := util.Clean(item.Role) == role &&
			util.Clean(item.Kind) == AuthKindAPIKey &&
			util.Clean(item.OwnerID) == owner.ID
		if !matchesPersonalAPIKey {
			nextItems = append(nextItems, item)
			continue
		}
		if found {
			continue
		}
		updated = item
		updated.Name = name
		updated.Provider = owner.Provider
		updated.OwnerName = owner.Name
		storeAuthSecret(&updated, raw)
		updated.Enabled = true
		updated.LastUsedAt = ""
		updated.UpdatedAt = now
		s.applyIdentityRoleToAPIKey(&updated, role, owner.ID)
		nextItems = append(nextItems, updated)
		found = true
	}
	if !found {
		updated = newAuthItem(role, AuthKindAPIKey, name, owner, raw)
		s.applyIdentityRoleToAPIKey(&updated, role, owner.ID)
		nextItems = append(nextItems, updated)
	}
	s.items = nextItems
	if err := s.saveLocked(); err != nil {
		s.items = previousItems
		return AuthKeyPublic{}, "", err
	}
	return AuthKeyPublicFromRecord(updated), raw, nil
}

func (s *AuthService) RevealKey(id string, filter AuthKeyFilter) (string, bool) {
	id = util.Clean(id)
	if id == "" {
		return "", false
	}
	filter = normalizeAuthKeyFilter(filter)
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		if item.ID != id || !matchAuthKey(item, filter) {
			continue
		}
		// New credentials store only key_hash. Legacy rows may still have plaintext "key".
		raw := util.Clean(item.Key)
		if raw == "" {
			return "", false
		}
		return raw, true
	}
	return "", false
}

func (s *AuthService) UpdateKey(id string, updates AuthKeyUpdate, filter AuthKeyFilter) (AuthKeyPublic, error) {
	id = util.Clean(id)
	if id == "" || !updates.HasFields() {
		return AuthKeyPublic{}, nil
	}
	filter = normalizeAuthKeyFilter(filter)
	s.mu.Lock()
	defer s.mu.Unlock()
	for index, item := range s.items {
		if item.ID != id || !matchAuthKey(item, filter) {
			continue
		}
		next := item
		if updates.Name != nil {
			name := util.Clean(*updates.Name)
			if name == "" {
				name = defaultCredentialName(util.Clean(next.Role), util.Clean(next.Kind))
			}
			next.Name = name
		}
		if updates.Enabled != nil {
			next.Enabled = *updates.Enabled
		}
		prev := item
		s.items[index] = next
		if err := s.saveLocked(); err != nil {
			s.items[index] = prev
			return AuthKeyPublic{}, fmt.Errorf("保存密钥失败: %w", err)
		}
		return AuthKeyPublicFromRecord(next), nil
	}
	return AuthKeyPublic{}, nil
}

func (s *AuthService) UpdateUser(id string, updates ManagedUserUpdate) (ManagedUserPublic, error) {
	id = util.Clean(id)
	if id == "" || !updates.HasFields() {
		return ManagedUserPublic{}, nil
	}
	hasName := updates.Name != nil
	hasEnabled := updates.Enabled != nil
	hasRoleID := updates.RoleID != nil
	name := ""
	if hasName {
		name = util.Clean(*updates.Name)
	}
	enabled := false
	if hasEnabled {
		enabled = *updates.Enabled
	}
	roleID := ""
	if hasRoleID {
		roleID = util.Clean(*updates.RoleID)
		if roleID == "" {
			roleID = DefaultManagedRoleID
		}
	}
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	var selectedRole ManagedRole
	if hasRoleID {
		role, ok := managedRoleByIDLocked(s.roles, roleID)
		if !ok {
			return ManagedUserPublic{}, nil
		}
		selectedRole = role
	}
	accountDisplayName := ""
	if account, ok := passwordAccountByIDLocked(s.accounts, id); ok {
		accountDisplayName = account.DisplayName()
	}
	prevAccounts := append([]PasswordAccount(nil), s.accounts...)
	prevItems := append([]AuthKey(nil), s.items...)
	changed := false
	for index, account := range s.accounts {
		if account.ID != id || account.Role != AuthRoleUser {
			continue
		}
		next := account
		if hasName {
			next.Name = name
			if next.Name == "" {
				next.Name = account.Username
			}
		}
		if hasEnabled {
			next.Enabled = enabled
		}
		if hasRoleID {
			next.RoleID = selectedRole.ID
		}
		next.UpdatedAt = now
		s.accounts[index] = next
		changed = true
	}
	for index, item := range s.items {
		if managedAuthUserID(item) != id {
			continue
		}
		next := item
		if hasName {
			itemName := name
			if itemName == "" {
				itemName = accountDisplayName
			}
			if itemName == "" {
				itemName = defaultCredentialName(util.Clean(next.Role), util.Clean(next.Kind))
			}
			if util.Clean(next.OwnerID) != "" {
				next.OwnerName = itemName
				if util.Clean(next.Kind) == AuthKindSession {
					next.Name = itemName
				}
			} else {
				next.Name = itemName
			}
		}
		if hasEnabled {
			next.Enabled = enabled
		}
		if hasRoleID {
			applyManagedRoleToAuthItem(&next, selectedRole)
		}
		next.UpdatedAt = now
		s.items[index] = next
		changed = true
	}
	if !changed {
		return ManagedUserPublic{}, nil
	}
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = prevAccounts
		s.items = prevItems
		s.rebuildKeyIndexLocked()
		primary := fmt.Errorf("保存用户账号失败: %w", err)
		return ManagedUserPublic{}, authRollbackError(primary, s.savePasswordAccountsLocked())
	}
	if err := s.saveLocked(); err != nil {
		s.accounts = prevAccounts
		s.items = prevItems
		s.rebuildKeyIndexLocked()
		primary := fmt.Errorf("保存用户密钥失败: %w", err)
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return ManagedUserPublic{}, authRollbackError(primary, rollbackErr)
	}
	user, ok := managedUserPublicByIDLocked(s.items, s.roles, s.accounts, id)
	if !ok {
		return ManagedUserPublic{}, nil
	}
	return user, nil
}
