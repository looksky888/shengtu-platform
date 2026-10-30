package service

import (
	"errors"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

func (s *AuthService) DeleteKey(id string, filter AuthKeyFilter) (bool, error) {
	id = util.Clean(id)
	if id == "" {
		return false, nil
	}
	filter = normalizeAuthKeyFilter(filter)
	s.mu.Lock()
	defer s.mu.Unlock()
	prev := append([]AuthKey(nil), s.items...)
	next := make([]AuthKey, 0, len(s.items))
	removed := false
	for _, item := range s.items {
		if item.ID == id && matchAuthKey(item, filter) {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return false, nil
	}
	s.items = next
	if err := s.saveLocked(); err != nil {
		s.items = prev
		return false, fmt.Errorf("保存密钥删除失败: %w", err)
	}
	return true, nil
}

// IsProtectedManagedUser reports whether id must not be deleted from admin UI
// (bootstrap admin password account or role=admin credentials).
func (s *AuthService) IsProtectedManagedUser(id string) bool {
	id = util.Clean(id)
	if id == "" {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isProtectedManagedUserLocked(id)
}

func (s *AuthService) isProtectedManagedUserLocked(id string) bool {
	if account, ok := passwordAccountByIDLocked(s.accounts, id); ok {
		if account.Role == AuthRoleAdmin || strings.EqualFold(account.Username, "admin") {
			return true
		}
	}
	for _, item := range s.items {
		if managedAuthUserID(item) != id {
			continue
		}
		if util.Clean(item.Role) == AuthRoleAdmin || util.Clean(item.RoleID) == AuthRoleAdmin {
			return true
		}
	}
	return false
}

func (s *AuthService) DeleteUser(id string) (bool, error) {
	id = util.Clean(id)
	if id == "" {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// Defense in depth (HTTP also checks).
	if s.isProtectedManagedUserLocked(id) {
		return false, fmt.Errorf("不能删除受保护的管理员账号")
	}
	prevAccounts := append([]PasswordAccount(nil), s.accounts...)
	prevItems := append([]AuthKey(nil), s.items...)
	removed := false
	nextAccounts := make([]PasswordAccount, 0, len(s.accounts))
	for _, account := range s.accounts {
		if account.ID == id {
			removed = true
			continue
		}
		nextAccounts = append(nextAccounts, account)
	}
	next := make([]AuthKey, 0, len(s.items))
	for _, item := range s.items {
		if managedAuthUserID(item) == id {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return false, nil
	}
	s.accounts = nextAccounts
	s.items = next
	if err := s.savePasswordAccountsLocked(); err != nil {
		s.accounts = prevAccounts
		s.items = prevItems
		s.rebuildKeyIndexLocked()
		primary := fmt.Errorf("保存用户删除失败: %w", err)
		return false, authRollbackError(primary, s.savePasswordAccountsLocked())
	}
	if err := s.saveLocked(); err != nil {
		s.accounts = prevAccounts
		s.items = prevItems
		s.rebuildKeyIndexLocked()
		primary := fmt.Errorf("保存密钥删除失败: %w", err)
		rollbackErr := errors.Join(s.savePasswordAccountsLocked(), s.saveLocked())
		return false, authRollbackError(primary, rollbackErr)
	}
	return true, nil
}
