package service

import (
	"chatgpt2api/internal/util"
	"fmt"
	"sort"
	"time"
)

// MaxSessionsPerAccount caps how many concurrent active browser sessions a
// single password/email account may hold before the least-recently-used session
// is evicted.
const MaxSessionsPerAccount = 5

func sessionActivityTimestamp(item AuthKey) string {
	if used := util.Clean(item.LastUsedAt); used != "" {
		return used
	}
	if updated := util.Clean(item.UpdatedAt); updated != "" {
		return updated
	}
	return util.Clean(item.CreatedAt)
}

func (s *AuthService) populateIssuedSessionFieldsLocked(item *AuthKey, account PasswordAccount, raw, now string, rememberMe bool) {
	item.Name = passwordSessionName
	item.OwnerID = account.ID
	item.OwnerName = account.DisplayName()
	item.Provider = AuthProviderLocal
	item.Kind = AuthKindSession
	item.Username = account.Username
	storeAuthSecret(item, raw)
	item.Enabled = account.Enabled
	item.RememberMe = rememberMe
	item.LastUsedAt = ""
	item.UpdatedAt = now
	item.ExpiresAt = passwordSessionExpiresAt(now)
	if account.Role == AuthRoleUser {
		item.Role = AuthRoleUser
		applyManagedRoleToAuthItem(item, roleForAccountLocked(s.roles, account))
	} else {
		item.Role = AuthRoleAdmin
		item.RoleID = AuthRoleAdmin
		item.RoleName = "管理员"
		item.applyPermissions(DefaultPermissionSetForRole(AuthRoleAdmin))
	}
}

// issuePasswordSessionLocked issues a new session token while allowing up to
// MaxSessionsPerAccount concurrent active sessions per account (LRU-evicting the
// oldest active session when full, or reusing expired/disabled session slots).
// Returns the issued AuthKey, raw token, and the slice of mutated AuthKeys to persist.
func (s *AuthService) issuePasswordSessionLocked(account PasswordAccount, now string, rememberMe bool) (AuthKey, string, []AuthKey) {
	raw := "sess-" + util.RandomTokenURL(32)
	owner := AuthOwner{
		ID:       account.ID,
		Name:     account.DisplayName(),
		Provider: AuthProviderLocal,
	}
	nowTime, err := time.Parse(time.RFC3339Nano, util.Clean(now))
	if err != nil {
		nowTime = time.Now()
	}

	var activeIndices []int
	var reusableIndices []int
	for index, item := range s.items {
		if util.Clean(item.Kind) != AuthKindSession ||
			util.Clean(item.Provider) != AuthProviderLocal ||
			util.Clean(item.OwnerID) != account.ID {
			continue
		}
		if !item.Enabled || authSessionExpired(item, nowTime) {
			reusableIndices = append(reusableIndices, index)
		} else {
			activeIndices = append(activeIndices, index)
		}
	}

	if len(activeIndices) < MaxSessionsPerAccount {
		if len(reusableIndices) > 0 {
			target := reusableIndices[0]
			next := s.items[target]
			next.CreatedAt = now
			s.populateIssuedSessionFieldsLocked(&next, account, raw, now, rememberMe)
			s.items[target] = next
			return next, raw, []AuthKey{next}
		}
		item := newAuthItem(account.Role, AuthKindSession, passwordSessionName, owner, raw)
		item.CreatedAt = now
		s.populateIssuedSessionFieldsLocked(&item, account, raw, now, rememberMe)
		s.items = append(s.items, item)
		return item, raw, []AuthKey{item}
	}

	// Sort active sessions oldest-activity-first so activeIndices[0] is LRU.
	sort.SliceStable(activeIndices, func(i, j int) bool {
		ti := sessionActivityTimestamp(s.items[activeIndices[i]])
		tj := sessionActivityTimestamp(s.items[activeIndices[j]])
		if ti != tj {
			return ti < tj
		}
		return s.items[activeIndices[i]].ID < s.items[activeIndices[j]].ID
	})

	mutated := make([]AuthKey, 0, 2)
	// If legacy state somehow had more than MaxSessionsPerAccount active rows,
	// disable any overflow beyond the 4 newest kept sessions.
	overflowCount := len(activeIndices) - MaxSessionsPerAccount
	for k := 0; k < overflowCount; k++ {
		idx := activeIndices[k]
		disabled := s.items[idx]
		disabled.Enabled = false
		disabled.UpdatedAt = now
		s.items[idx] = disabled
		mutated = append(mutated, disabled)
	}

	target := activeIndices[overflowCount]
	next := s.items[target]
	next.CreatedAt = now
	s.populateIssuedSessionFieldsLocked(&next, account, raw, now, rememberMe)
	s.items[target] = next
	mutated = append(mutated, next)
	return next, raw, mutated
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
	prev := s.items[index]
	next := prev
	next.Enabled = false
	next.UpdatedAt = util.NowISO()
	s.items[index] = next
	if err := s.persistAuthKeyLocked(next); err != nil {
		s.items[index] = prev
		s.rebuildKeyIndexLocked()
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
