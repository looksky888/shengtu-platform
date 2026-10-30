package service

import (
	"chatgpt2api/internal/util"
)

func (s *AuthService) createCredential(role, kind, name string, owner AuthOwner, prefix string) (AuthKeyPublic, string, error) {
	role = normalizeAuthRole(role)
	if role == "" {
		role = AuthRoleUser
	}
	kind = normalizeAuthKind(kind)
	if kind == "" {
		kind = AuthKindAPIKey
	}
	owner = normalizeAuthOwner(owner)
	name = util.Clean(name)
	if name == "" {
		name = defaultCredentialName(role, kind)
	}
	if prefix == "" {
		prefix = "sk-"
	}
	raw := prefix + util.RandomTokenURL(24)
	item := newAuthItem(role, kind, name, owner, raw)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.applyRoleToAuthItem(&item, "")
	previousItems := append([]AuthKey(nil), s.items...)
	s.items = append(s.items, item)
	if err := s.persistAuthKeyLocked(item); err != nil {
		s.items = previousItems
		s.rebuildKeyIndexLocked()
		return AuthKeyPublic{}, "", err
	}
	return AuthKeyPublicFromRecord(item), raw, nil
}

// storeAuthSecret persists only the hash. Plaintext is returned once at create/rotate time.
func storeAuthSecret(item *AuthKey, raw string) {
	if item == nil {
		return
	}
	item.storeSecret(raw)
}

func newAuthItem(role, kind, name string, owner AuthOwner, raw string) AuthKey {
	role = normalizeAuthRole(role)
	kind = normalizeAuthKind(kind)
	owner = normalizeAuthOwner(owner)
	name = util.Clean(name)
	if name == "" {
		name = defaultCredentialName(role, kind)
	}
	provider := owner.Provider
	if provider == "" {
		provider = AuthProviderLocal
	}
	item := AuthKey{
		ID:        util.NewHex(12),
		Name:      name,
		Role:      role,
		Kind:      kind,
		Provider:  provider,
		OwnerID:   owner.ID,
		OwnerName: owner.Name,
		Enabled:   true,
		CreatedAt: util.NowISO(),
	}
	item.storeSecret(raw)
	item.applyPermissions(DefaultPermissionSetForRole(role))
	return item
}

func identityForAuthItem(item AuthKey) *Identity {
	credentialID := util.Clean(item.ID)
	credentialName := util.Clean(item.Name)
	ownerID := util.Clean(item.OwnerID)
	ownerName := util.Clean(item.OwnerName)
	id := ownerID
	if id == "" {
		id = credentialID
	}
	name := ownerName
	if name == "" {
		name = credentialName
	}
	return &Identity{
		ID:             id,
		Name:           name,
		Role:           util.Clean(item.Role),
		RoleID:         util.Clean(item.RoleID),
		RoleName:       util.Clean(item.RoleName),
		Provider:       util.Clean(item.Provider),
		OwnerID:        ownerID,
		CredentialID:   credentialID,
		CredentialName: credentialName,
		Kind:           util.Clean(item.Kind),
		RememberMe:     item.RememberMe,
		MenuPaths:      item.permissions().MenuPaths,
		APIPermissions: item.permissions().APIPermissions,
	}
}

func normalizeAuthKeyFilter(filter AuthKeyFilter) AuthKeyFilter {
	return AuthKeyFilter{
		Role:    normalizeAuthRole(util.Clean(filter.Role)),
		Kind:    normalizeAuthKind(util.Clean(filter.Kind)),
		OwnerID: util.Clean(filter.OwnerID),
	}
}

func matchAuthKey(item AuthKey, filter AuthKeyFilter) bool {
	if filter.Role != "" && util.Clean(item.Role) != filter.Role {
		return false
	}
	if filter.Kind != "" && util.Clean(item.Kind) != filter.Kind {
		return false
	}
	if filter.OwnerID != "" && util.Clean(item.OwnerID) != filter.OwnerID {
		return false
	}
	return true
}
