package service

import (
	"errors"
	"fmt"
	"log"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func (s *AuthService) load() ([]AuthKey, bool) {
	items, err := s.storage.LoadAuthKeys()
	if err != nil {
		return []AuthKey{}, false
	}
	return authKeysFromMaps(items), true
}

func (s *AuthService) loadRoles() ([]ManagedRole, bool) {
	var raw any
	if s.roleStore != nil {
		value, err := s.roleStore.LoadJSONDocument(rbacRolesDocumentName)
		if err != nil {
			log.Printf("RBAC role load failed (writes disabled): %v", err)
			return normalizeManagedRoles(nil), false
		}
		raw = value
	}
	return normalizeManagedRoles(raw), true
}

func (s *AuthService) loadPasswordAccounts() ([]PasswordAccount, bool) {
	var raw any
	if s.roleStore != nil {
		value, err := s.roleStore.LoadJSONDocument(passwordAccountsDocumentName)
		if err != nil {
			log.Printf("password account load failed (writes disabled): %v", err)
			return []PasswordAccount{}, false
		}
		raw = value
	}
	accounts := normalizePasswordAccounts(raw)
	if err := validateLoadedPasswordAccounts(accounts); err != nil {
		log.Printf("password account email validation failed (writes disabled): %v", err)
		return accounts, false
	}
	return accounts, true
}

func (s *AuthService) saveLocked() error {
	if !s.storeReady {
		return fmt.Errorf("鉴权数据未成功加载，已拒绝写入以防清空存储")
	}
	if err := s.storage.SaveAuthKeys(authKeysToMaps(s.items)); err != nil {
		return err
	}
	// Keep hash index coherent only after the mutation is durably persisted.
	s.rebuildKeyIndexLocked()
	return nil
}

// persistAuthKeyLocked writes one credential. Uses UpsertAuthKey when available.
func (s *AuthService) persistAuthKeyLocked(item AuthKey) error {
	if patcher, ok := s.storage.(storage.AuthKeyUpsertBackend); ok {
		if err := patcher.UpsertAuthKey(item.ID, item.toMap()); err != nil {
			return err
		}
		s.rebuildKeyIndexLocked()
		return nil
	}
	return s.saveLocked()
}

func (s *AuthService) savePasswordAccountsLocked() error {
	if !s.passwordStoreReady {
		return fmt.Errorf("密码账号数据未成功加载，已拒绝写入以防覆盖")
	}
	if s.roleStore == nil {
		return nil
	}
	items := make([]map[string]any, 0, len(s.accounts))
	for _, account := range s.accounts {
		items = append(items, storedPasswordAccount(account))
	}
	return s.roleStore.SaveJSONDocument(passwordAccountsDocumentName, map[string]any{"items": items})
}

func (s *AuthService) saveRolesLocked() error {
	if !s.roleStoreReady {
		return fmt.Errorf("RBAC 角色数据未成功加载，已拒绝写入以防覆盖")
	}
	if s.roleStore == nil {
		return nil
	}
	items := make([]map[string]any, 0, len(s.roles))
	for _, role := range s.roles {
		items = append(items, storedManagedRole(role))
	}
	return s.roleStore.SaveJSONDocument(rbacRolesDocumentName, map[string]any{"items": items})
}

func authRollbackError(operationErr, rollbackErr error) error {
	if rollbackErr == nil {
		return operationErr
	}
	return errors.Join(operationErr, fmt.Errorf("回滚鉴权数据失败: %w", rollbackErr))
}

func (s *AuthService) applyRolesToItems() {
	for i := range s.items {
		s.applyRoleToAuthItem(&s.items[i], managedAuthRoleID(s.items[i]))
	}
}

func (s *AuthService) syncPasswordAccountsToItems() {
	accountsByID := make(map[string]PasswordAccount, len(s.accounts))
	for _, account := range s.accounts {
		if account.ID != "" {
			accountsByID[account.ID] = account
		}
	}
	for i := range s.items {
		item := &s.items[i]
		if util.Clean(item.Provider) != AuthProviderLocal {
			continue
		}
		account, ok := accountsByID[util.Clean(item.OwnerID)]
		if !ok {
			continue
		}
		item.Username = account.Username
		item.OwnerName = account.DisplayName()
		item.Enabled = account.Enabled
		if account.Role == AuthRoleUser {
			item.Role = AuthRoleUser
			applyManagedRoleToAuthItem(item, roleForAccountLocked(s.roles, account))
			continue
		}
		item.Role = AuthRoleAdmin
		item.RoleID = AuthRoleAdmin
		item.RoleName = "管理员"
		item.applyPermissions(DefaultPermissionSetForRole(AuthRoleAdmin))
	}
}

func (s *AuthService) applyRoleToAuthItem(item *AuthKey, roleID string) {
	if item == nil || util.Clean(item.Role) != AuthRoleUser {
		return
	}
	role, ok := managedRoleByIDLocked(s.roles, roleID)
	if !ok {
		role, _ = managedRoleByIDLocked(s.roles, DefaultManagedRoleID)
	}
	applyManagedRoleToAuthItem(item, role)
}

func (s *AuthService) applyIdentityRoleToAPIKey(item *AuthKey, role, ownerID string) {
	if item == nil {
		return
	}
	if role == AuthRoleAdmin {
		item.Role = AuthRoleAdmin
		item.RoleID = AuthRoleAdmin
		item.RoleName = "管理员"
		item.applyPermissions(DefaultPermissionSetForRole(AuthRoleAdmin))
		return
	}
	if roleID, ok := managedAuthRoleIDLocked(s.items, s.accounts, ownerID); ok {
		s.applyRoleToAuthItem(item, roleID)
		return
	}
	s.applyRoleToAuthItem(item, "")
}
