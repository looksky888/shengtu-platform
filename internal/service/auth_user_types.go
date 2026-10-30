package service

import "chatgpt2api/internal/util"

// ManagedUserPublic is the canonical admin managed-user view for API boundaries.
// Projection is typed end-to-end (lite index → ManagedUserPublic). List*Typed is the
// only public list entry; storage still uses map for JSON persistence.
type ManagedUserPublic struct {
	ID              string   `json:"id,omitempty"`
	Username        string   `json:"username,omitempty"`
	Email           string   `json:"email,omitempty"`
	Name            string   `json:"name,omitempty"`
	Role            string   `json:"role,omitempty"`
	RoleID          string   `json:"role_id,omitempty"`
	RoleName        string   `json:"role_name,omitempty"`
	Provider        string   `json:"provider,omitempty"`
	OwnerID         string   `json:"owner_id,omitempty"`
	OwnerName       string   `json:"owner_name,omitempty"`
	Enabled         bool     `json:"enabled"`
	HasAPIKey       bool     `json:"has_api_key"`
	HasSession      bool     `json:"has_session"`
	APIKeyID        string   `json:"api_key_id,omitempty"`
	APIKeyName      string   `json:"api_key_name,omitempty"`
	SessionID       string   `json:"session_id,omitempty"`
	SessionName     string   `json:"session_name,omitempty"`
	CredentialCount int      `json:"credential_count"`
	CreatedAt       string   `json:"created_at,omitempty"`
	LastUsedAt      string   `json:"last_used_at,omitempty"`
	UpdatedAt       string   `json:"updated_at,omitempty"`
	MenuPaths       []string `json:"menu_paths,omitempty"`
	APIPermissions  []string `json:"api_permissions,omitempty"`
	// CreditBalance is filled by admin list handlers when credits service is available.
	CreditBalance int `json:"credit_balance"`
	// InactiveDays is days since last activity (login/API use); large when never active.
	// Filled on admin list for cleanup UX. Usage stats live on GET .../users/usage, not here.
	InactiveDays int `json:"inactive_days"`
}

// ListUsersTyped returns typed managed users via the same projector as the paged list.
func (s *AuthService) ListUsersTyped() []ManagedUserPublic {
	s.mu.RLock()
	defer s.mu.RUnlock()
	lites := listManagedUserLitesLocked(s.items, s.roles, s.accounts)
	ids := make([]string, 0, len(lites))
	for _, row := range lites {
		if row.ID != "" {
			ids = append(ids, row.ID)
		}
	}
	return projectManagedUsersByIDsLocked(s.items, s.roles, s.accounts, ids)
}

// ManagedUserExists reports whether a managed user id projects to a public row.
func (s *AuthService) ManagedUserExists(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := managedUserPublicByIDLocked(s.items, s.roles, s.accounts, id)
	return ok
}

// GetManagedUserPublic returns a typed managed-user row for admin/audit use.
func (s *AuthService) GetManagedUserPublic(id string) (ManagedUserPublic, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return managedUserPublicByIDLocked(s.items, s.roles, s.accounts, id)
}

// AuthKeyPublic is the canonical public API-key / credential view.
type AuthKeyPublic struct {
	ID             string   `json:"id,omitempty"`
	Name           string   `json:"name,omitempty"`
	Role           string   `json:"role,omitempty"`
	RoleID         string   `json:"role_id,omitempty"`
	RoleName       string   `json:"role_name,omitempty"`
	Kind           string   `json:"kind,omitempty"`
	Provider       string   `json:"provider,omitempty"`
	OwnerID        string   `json:"owner_id,omitempty"`
	OwnerName      string   `json:"owner_name,omitempty"`
	KeyHint        string   `json:"key_hint,omitempty"`
	Enabled        bool     `json:"enabled"`
	CreatedAt      string   `json:"created_at,omitempty"`
	ExpiresAt      string   `json:"expires_at,omitempty"`
	LastUsedAt     string   `json:"last_used_at,omitempty"`
	MenuPaths      []string `json:"menu_paths,omitempty"`
	APIPermissions []string `json:"api_permissions,omitempty"`
}

// AuthKeyPublicFromRecord converts a stored AuthKey for API responses.
func AuthKeyPublicFromRecord(item AuthKey) AuthKeyPublic {
	return AuthKeyPublic{
		ID:             item.ID,
		Name:           item.Name,
		Role:           item.Role,
		RoleID:         item.RoleID,
		RoleName:       item.RoleName,
		Kind:           item.Kind,
		Provider:       item.Provider,
		OwnerID:        item.OwnerID,
		OwnerName:      item.OwnerName,
		KeyHint:        item.KeyHint,
		Enabled:        item.Enabled,
		CreatedAt:      item.CreatedAt,
		ExpiresAt:      item.ExpiresAt,
		LastUsedAt:     item.LastUsedAt,
		MenuPaths:      cloneNonNilStringSlice(item.permissions().MenuPaths),
		APIPermissions: cloneNonNilStringSlice(item.permissions().APIPermissions),
	}
}

// ListKeysTyped returns typed public API keys for the filter.
func (s *AuthService) ListKeysTyped(filter AuthKeyFilter) []AuthKeyPublic {
	filter = normalizeAuthKeyFilter(filter)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AuthKeyPublic, 0, len(s.items))
	for _, item := range s.items {
		if matchAuthKey(item, filter) {
			out = append(out, AuthKeyPublicFromRecord(item))
		}
	}
	return out
}

// ListSingleAPIKeyForOwnerTyped returns typed personal API key for an owner.
func (s *AuthService) ListSingleAPIKeyForOwnerTyped(ownerID string) []AuthKeyPublic {
	ownerID = util.Clean(ownerID)
	if ownerID == "" {
		return []AuthKeyPublic{}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.items {
		if util.Clean(item.Role) == AuthRoleUser &&
			util.Clean(item.Kind) == AuthKindAPIKey &&
			util.Clean(item.OwnerID) == ownerID {
			return []AuthKeyPublic{AuthKeyPublicFromRecord(item)}
		}
	}
	return []AuthKeyPublic{}
}

// ListPersonalAPIKeyTyped returns typed personal profile API keys.
func (s *AuthService) ListPersonalAPIKeyTyped(identity Identity) []AuthKeyPublic {
	role, owner, ok := personalAPIKeyScope(identity)
	if !ok {
		return []AuthKeyPublic{}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.items {
		if util.Clean(item.Role) == role &&
			util.Clean(item.Kind) == AuthKindAPIKey &&
			util.Clean(item.OwnerID) == owner.ID {
			return []AuthKeyPublic{AuthKeyPublicFromRecord(item)}
		}
	}
	return []AuthKeyPublic{}
}

// ManagedRolePublic is the canonical admin role list / mutation view.
type ManagedRolePublic struct {
	ID             string   `json:"id,omitempty"`
	Name           string   `json:"name,omitempty"`
	Description    string   `json:"description,omitempty"`
	Builtin        bool     `json:"builtin,omitempty"`
	UserCount      int      `json:"user_count"`
	CreatedAt      string   `json:"created_at,omitempty"`
	UpdatedAt      string   `json:"updated_at,omitempty"`
	MenuPaths      []string `json:"menu_paths,omitempty"`
	APIPermissions []string `json:"api_permissions,omitempty"`
}

// ManagedRolePublicFromRecord builds a public role row with user_count.
func ManagedRolePublicFromRecord(role ManagedRole, userCount int) ManagedRolePublic {
	perms := role.PermissionSet()
	return ManagedRolePublic{
		ID:             role.ID,
		Name:           role.Name,
		Description:    role.Description,
		Builtin:        role.Builtin,
		UserCount:      userCount,
		CreatedAt:      role.CreatedAt,
		UpdatedAt:      role.UpdatedAt,
		MenuPaths:      append([]string(nil), perms.MenuPaths...),
		APIPermissions: append([]string(nil), perms.APIPermissions...),
	}
}

// ListRolesTyped returns typed managed roles.
func (s *AuthService) ListRolesTyped() []ManagedRolePublic {
	s.mu.RLock()
	defer s.mu.RUnlock()
	counts := managedRoleUserCountsLocked(s.items, s.accounts)
	out := make([]ManagedRolePublic, 0, len(s.roles))
	for _, role := range s.roles {
		out = append(out, ManagedRolePublicFromRecord(role, counts[role.ID]))
	}
	return out
}
