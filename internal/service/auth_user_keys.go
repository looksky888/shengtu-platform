package service

import "chatgpt2api/internal/util"

func (s *AuthService) ResetUserAPIKey(id, name string) (ManagedUserPublic, AuthKeyPublic, string, bool, error) {
	id = util.Clean(id)
	if id == "" {
		return ManagedUserPublic{}, AuthKeyPublic{}, "", false, nil
	}
	name = util.Clean(name)
	raw := "sk-" + util.RandomTokenURL(24)
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	previousItems := append([]AuthKey(nil), s.items...)
	owner, found := managedAuthOwnerLocked(s.items, s.accounts, id)
	if !found {
		return ManagedUserPublic{}, AuthKeyPublic{}, "", false, nil
	}
	currentUser, userOK := managedUserPublicByIDLocked(s.items, s.roles, s.accounts, id)
	enabled := userOK && currentUser.Enabled

	var updated AuthKey
	foundUpdated := false
	if owner.ID != "" {
		if name == "" {
			name = "我的 API 令牌"
		}
		nextItems := make([]AuthKey, 0, len(s.items)+1)
		for _, item := range s.items {
			matchesOwnerAPIKey := util.Clean(item.Role) == AuthRoleUser &&
				util.Clean(item.Kind) == AuthKindAPIKey &&
				util.Clean(item.OwnerID) == owner.ID
			if !matchesOwnerAPIKey {
				nextItems = append(nextItems, item)
				continue
			}
			if foundUpdated {
				continue
			}
			updated = item
			updated.Name = name
			updated.Provider = owner.Provider
			updated.OwnerName = owner.Name
			storeAuthSecret(&updated, raw)
			updated.Enabled = enabled
			updated.LastUsedAt = ""
			updated.UpdatedAt = now
			nextItems = append(nextItems, updated)
			foundUpdated = true
		}
		if !foundUpdated {
			updated = newAuthItem(AuthRoleUser, AuthKindAPIKey, name, owner, raw)
			if roleID, ok := managedAuthRoleIDLocked(s.items, s.accounts, id); ok {
				s.applyRoleToAuthItem(&updated, roleID)
			} else {
				s.applyRoleToAuthItem(&updated, "")
			}
			updated.Enabled = enabled
			nextItems = append(nextItems, updated)
			foundUpdated = true
		}
		s.items = nextItems
	} else {
		for index, item := range s.items {
			if managedAuthUserID(item) != id || util.Clean(item.Kind) != AuthKindAPIKey {
				continue
			}
			if name == "" {
				name = util.Clean(item.Name)
			}
			if name == "" {
				name = defaultCredentialName(AuthRoleUser, AuthKindAPIKey)
			}
			updated = item
			updated.Name = name
			storeAuthSecret(&updated, raw)
			updated.Enabled = enabled
			updated.LastUsedAt = ""
			updated.UpdatedAt = now
			s.items[index] = updated
			foundUpdated = true
			break
		}
	}
	if !foundUpdated {
		return ManagedUserPublic{}, AuthKeyPublic{}, "", false, nil
	}
	if err := s.saveLocked(); err != nil {
		s.items = previousItems
		return ManagedUserPublic{}, AuthKeyPublic{}, "", true, err
	}
	key := AuthKeyPublicFromRecord(updated)
	user, ok := managedUserPublicByIDLocked(s.items, s.roles, s.accounts, id)
	if !ok {
		return ManagedUserPublic{}, key, raw, true, nil
	}
	return user, key, raw, true, nil
}

func (s *AuthService) RevealUserAPIKey(id string) (string, bool) {
	id = util.Clean(id)
	if id == "" {
		return "", false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, item := range s.items {
		if managedAuthUserID(item) != id || util.Clean(item.Kind) != AuthKindAPIKey {
			continue
		}
		// Plaintext is never retained (legacy rows are rewritten hash-only at boot),
		// so this intentionally always reports "not available".
		raw := util.Clean(item.Key)
		if raw == "" {
			return "", false
		}
		return raw, true
	}
	return "", false
}
