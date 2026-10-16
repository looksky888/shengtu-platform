package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"time"
)

func (s *AuthService) issuePasswordSessionLocked(account PasswordAccount, now string) (AuthKey, string) {
	raw := "sess-" + util.RandomTokenURL(32)
	owner := AuthOwner{
		ID:       account.ID,
		Name:     account.DisplayName(),
		Provider: AuthProviderLocal,
	}
	for index, item := range s.items {
		if util.Clean(item.Kind) != AuthKindSession ||
			util.Clean(item.Provider) != AuthProviderLocal ||
			util.Clean(item.OwnerID) != account.ID {
			continue
		}
		next := item
		next.Name = passwordSessionName
		next.OwnerName = account.DisplayName()
		next.Username = account.Username
		storeAuthSecret(&next, raw)
		next.Enabled = account.Enabled
		next.LastUsedAt = ""
		next.UpdatedAt = now
		next.ExpiresAt = passwordSessionExpiresAt(now)
		if account.Role == AuthRoleUser {
			applyManagedRoleToAuthItem(&next, roleForAccountLocked(s.roles, account))
		} else {
			next.Role = AuthRoleAdmin
			next.RoleID = AuthRoleAdmin
			next.RoleName = "管理员"
			next.applyPermissions(DefaultPermissionSetForRole(AuthRoleAdmin))
		}
		s.items[index] = next
		return next, raw
	}

	item := newAuthItem(account.Role, AuthKindSession, passwordSessionName, owner, raw)
	item.Username = account.Username
	item.Enabled = account.Enabled
	item.UpdatedAt = now
	item.ExpiresAt = passwordSessionExpiresAt(now)
	if account.Role == AuthRoleUser {
		applyManagedRoleToAuthItem(&item, roleForAccountLocked(s.roles, account))
	} else {
		item.RoleID = AuthRoleAdmin
		item.RoleName = "管理员"
	}
	s.items = append(s.items, item)
	return item, raw
}

func (s *AuthService) RevokeSession(raw string) (bool, error) {
	candidate := util.Clean(raw)
	if candidate == "" {
		return false, nil
	}
	hash := util.SHA256Hex(candidate)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.keyIndex == nil {
		s.rebuildKeyIndexLocked()
	}
	index, ok := s.keyIndex[hash]
	if !ok || index < 0 || index >= len(s.items) || s.items[index].Kind != AuthKindSession {
		return false, nil
	}
	s.items[index].Enabled = false
	s.items[index].UpdatedAt = util.NowISO()
	if err := s.saveLocked(); err != nil {
		return true, fmt.Errorf("撤销登录会话失败: %w", err)
	}
	return true, nil
}

func passwordSessionExpiresAt(issuedAt string) string {
	issued, err := time.Parse(time.RFC3339Nano, util.Clean(issuedAt))
	if err != nil {
		issued = time.Now()
	}
	return issued.Add(passwordSessionTTL).Format(time.RFC3339Nano)
}

func authSessionExpired(item AuthKey, now time.Time) bool {
	if util.Clean(item.Kind) != AuthKindSession {
		return false
	}
	expires, err := time.Parse(time.RFC3339Nano, util.Clean(item.ExpiresAt))
	return err != nil || !expires.After(now)
}

func roleForAccountLocked(roles []ManagedRole, account PasswordAccount) ManagedRole {
	role, ok := managedRoleByIDLocked(roles, account.ManagedRoleID())
	if ok {
		return role
	}
	role, _ = managedRoleByIDLocked(roles, DefaultManagedRoleID)
	return role
}
