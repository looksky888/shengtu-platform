package service

import (
	"chatgpt2api/internal/util"
)

// AuthKey is the persisted API key / session credential (memory + auth_keys storage).
type AuthKey struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Role           string   `json:"role"`
	RoleID         string   `json:"role_id,omitempty"`
	RoleName       string   `json:"role_name,omitempty"`
	Kind           string   `json:"kind"`
	Provider       string   `json:"provider"`
	OwnerID        string   `json:"owner_id,omitempty"`
	OwnerName      string   `json:"owner_name,omitempty"`
	Username       string   `json:"username,omitempty"`
	Key            string   `json:"key,omitempty"` // legacy plaintext; empty for hash-only credentials
	KeyHash        string   `json:"key_hash"`
	KeyHint        string   `json:"key_hint,omitempty"`
	Enabled        bool     `json:"enabled"`
	CreatedAt      string   `json:"created_at"`
	ExpiresAt      string   `json:"expires_at,omitempty"`
	LastUsedAt     string   `json:"last_used_at,omitempty"`
	UpdatedAt      string   `json:"updated_at,omitempty"`
	MenuPaths      []string `json:"menu_paths,omitempty"`
	APIPermissions []string `json:"api_permissions,omitempty"`
}

func authKeyFromMap(raw map[string]any) (AuthKey, bool) {
	if raw == nil {
		return AuthKey{}, false
	}
	role := normalizeAuthRole(util.Clean(raw["role"]))
	if role == "" {
		return AuthKey{}, false
	}
	key := util.Clean(raw["key"])
	hash := util.Clean(raw["key_hash"])
	keyHint := util.Clean(raw["key_hint"])
	if keyHint == "" && key != "" {
		keyHint = maskAPIKeyHint(key)
	}
	// Accept hash-only credentials (new). Legacy rows may still carry plaintext key.
	if hash == "" && key != "" {
		hash = util.SHA256Hex(key)
	}
	if hash == "" {
		return AuthKey{}, false
	}
	if key != "" && util.SHA256Hex(key) != hash {
		return AuthKey{}, false
	}
	kind := normalizeAuthKind(util.Clean(raw["kind"]))
	if kind == "" {
		kind = AuthKindAPIKey
	}
	id := util.Clean(raw["id"])
	if id == "" {
		id = util.NewHex(12)
	}
	name := util.Clean(raw["name"])
	if name == "" {
		name = defaultCredentialName(role, kind)
	}
	provider := normalizeAuthProvider(util.Clean(raw["provider"]))
	if provider == "" {
		provider = AuthProviderLocal
	}
	created := util.Clean(raw["created_at"])
	if created == "" {
		created = util.NowISO()
	}
	item := AuthKey{
		ID:        id,
		Name:      name,
		Role:      role,
		Kind:      kind,
		Provider:  provider,
		OwnerID:   util.Clean(raw["owner_id"]),
		OwnerName: util.Clean(raw["owner_name"]),
		Username:  util.Clean(raw["username"]),
		// Plaintext never enters memory or storage: a legacy row's "key" is only
		// used above to derive/verify key_hash. AuthService rewrites such rows
		// hash-only on boot (see eraseLegacyPlaintextKeys).
		Key:        "",
		KeyHash:    hash,
		KeyHint:    keyHint,
		Enabled:    util.ToBool(util.ValueOr(raw["enabled"], true)),
		CreatedAt:  created,
		ExpiresAt:  util.Clean(raw["expires_at"]),
		LastUsedAt: util.Clean(raw["last_used_at"]),
		UpdatedAt:  util.Clean(raw["updated_at"]),
	}
	if kind == AuthKindSession && item.ExpiresAt == "" {
		item.ExpiresAt = passwordSessionExpiresAt(created)
	}
	if role == AuthRoleUser {
		roleID := util.Clean(raw["role_id"])
		if roleID == "" {
			roleID = DefaultManagedRoleID
		}
		item.RoleID = roleID
		item.RoleName = util.Clean(raw["role_name"])
	} else if role == AuthRoleAdmin {
		item.RoleID = AuthRoleAdmin
		item.RoleName = "管理员"
	}
	permissions := DefaultPermissionSetForRole(role)
	if _, ok := raw["menu_paths"]; ok {
		permissions.MenuPaths = NormalizeMenuPermissions(util.AsStringSlice(raw["menu_paths"]))
	}
	if _, ok := raw["api_permissions"]; ok {
		permissions.APIPermissions = NormalizeAPIPermissions(util.AsStringSlice(raw["api_permissions"]))
	}
	item.MenuPaths = append([]string(nil), permissions.MenuPaths...)
	item.APIPermissions = append([]string(nil), permissions.APIPermissions...)
	return item, true
}

func (k AuthKey) toMap() map[string]any {
	out := map[string]any{
		"id":              k.ID,
		"name":            k.Name,
		"role":            k.Role,
		"kind":            k.Kind,
		"provider":        k.Provider,
		"owner_id":        k.OwnerID,
		"owner_name":      k.OwnerName,
		"key_hash":        k.KeyHash,
		"enabled":         k.Enabled,
		"created_at":      k.CreatedAt,
		"menu_paths":      append([]string(nil), k.MenuPaths...),
		"api_permissions": append([]string(nil), k.APIPermissions...),
	}
	if k.KeyHint != "" {
		out["key_hint"] = k.KeyHint
	}
	if k.RoleID != "" {
		out["role_id"] = k.RoleID
	}
	if k.RoleName != "" {
		out["role_name"] = k.RoleName
	}
	if k.Username != "" {
		out["username"] = k.Username
	}
	if k.ExpiresAt != "" {
		out["expires_at"] = k.ExpiresAt
	}
	if k.LastUsedAt != "" {
		out["last_used_at"] = k.LastUsedAt
	} else {
		out["last_used_at"] = nil
	}
	if k.UpdatedAt != "" {
		out["updated_at"] = k.UpdatedAt
	}
	return out
}

func authKeysFromMaps(items []map[string]any) []AuthKey {
	out := make([]AuthKey, 0, len(items))
	for _, item := range items {
		if k, ok := authKeyFromMap(item); ok {
			out = append(out, k)
		}
	}
	return out
}

func authKeysToMaps(items []AuthKey) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, item.toMap())
	}
	return out
}

func (k AuthKey) permissions() PermissionSet {
	return PermissionSet{
		MenuPaths:      NormalizeMenuPermissions(k.MenuPaths),
		APIPermissions: NormalizeAPIPermissions(k.APIPermissions),
	}
}

func (k *AuthKey) applyPermissions(permissions PermissionSet) {
	if k == nil {
		return
	}
	k.MenuPaths = append([]string(nil), NormalizeMenuPermissions(permissions.MenuPaths)...)
	k.APIPermissions = append([]string(nil), NormalizeAPIPermissions(permissions.APIPermissions)...)
}

func (k *AuthKey) storeSecret(raw string) {
	if k == nil {
		return
	}
	k.Key = ""
	k.KeyHash = util.SHA256Hex(raw)
	k.KeyHint = maskAPIKeyHint(raw)
}

func maskAPIKeyHint(raw string) string {
	trimmed := util.Clean(raw)
	if len(trimmed) < 12 {
		return ""
	}
	return trimmed[:7] + "••••••••" + trimmed[len(trimmed)-4:]
}

// authKeyPlaintextCount reports how many stored rows still carry a plaintext
// "key" field. Used once at boot to decide whether a hash-only rewrite is needed.
func authKeyPlaintextCount(raw []map[string]any) int {
	count := 0
	for _, item := range raw {
		if util.Clean(item["key"]) != "" {
			count++
		}
	}
	return count
}
