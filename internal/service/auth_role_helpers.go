package service

import (
	"sort"
	"strings"

	"chatgpt2api/internal/util"
)

func normalizeManagedRoles(raw any) []ManagedRole {
	items := util.AsMapSlice(raw)
	if obj, ok := raw.(map[string]any); ok {
		items = util.AsMapSlice(obj["items"])
	}
	roles := make([]ManagedRole, 0, len(items)+1)
	for _, item := range items {
		role := normalizeManagedRole(item)
		if role.ID == "" {
			continue
		}
		roles = append(roles, role)
	}
	roles = mergeDefaultManagedRole(roles)
	sortManagedRoles(roles)
	return roles
}

func normalizeManagedRole(raw map[string]any) ManagedRole {
	id := util.Clean(raw["id"])
	name := util.Clean(raw["name"])
	if id == "" || name == "" {
		return ManagedRole{}
	}
	return ManagedRole{
		ID:             id,
		Name:           name,
		Description:    util.Clean(raw["description"]),
		Builtin:        util.ToBool(raw["builtin"]) && id == DefaultManagedRoleID,
		MenuPaths:      NormalizeMenuPermissions(util.AsStringSlice(raw["menu_paths"])),
		APIPermissions: NormalizeManagedRoleAPIPermissions(util.AsStringSlice(raw["api_permissions"])),
		CreatedAt:      util.Clean(raw["created_at"]),
		UpdatedAt:      util.Clean(raw["updated_at"]),
	}
}

func mergeDefaultManagedRole(roles []ManagedRole) []ManagedRole {
	defaultRole := defaultManagedRole()
	out := make([]ManagedRole, 0, len(roles)+1)
	seenDefault := false
	seen := map[string]struct{}{}
	for _, role := range roles {
		if _, ok := seen[role.ID]; ok {
			continue
		}
		seen[role.ID] = struct{}{}
		if role.ID == DefaultManagedRoleID {
			role.Builtin = true
			if role.Name == "" {
				role.Name = defaultRole.Name
			}
			if role.Description == "" {
				role.Description = defaultRole.Description
			}
			role.MenuPaths = mergePermissionStrings(role.MenuPaths, defaultRole.MenuPaths)
			role.APIPermissions = mergePermissionStrings(role.APIPermissions, defaultRole.APIPermissions)
			out = append(out, role)
			seenDefault = true
			continue
		}
		role.Builtin = false
		out = append(out, role)
	}
	if !seenDefault {
		out = append(out, defaultRole)
	}
	return out
}

func mergePermissionStrings(current, defaults []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(current)+len(defaults))
	for _, value := range append(append([]string{}, current...), defaults...) {
		value = util.Clean(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func defaultManagedRole() ManagedRole {
	permissions := DefaultPermissionSetForRole(AuthRoleUser)
	return ManagedRole{
		ID:             DefaultManagedRoleID,
		Name:           "普通用户",
		Description:    "默认用户角色，适合基础创作和个人令牌管理。",
		Builtin:        true,
		MenuPaths:      permissions.MenuPaths,
		APIPermissions: NormalizeManagedRoleAPIPermissions(permissions.APIPermissions),
	}
}

func sortManagedRoles(roles []ManagedRole) {
	sort.SliceStable(roles, func(i, j int) bool {
		if roles[i].Builtin != roles[j].Builtin {
			return roles[i].Builtin
		}
		if roles[i].Name != roles[j].Name {
			return roles[i].Name < roles[j].Name
		}
		return roles[i].ID < roles[j].ID
	})
}

func managedRoleByIDLocked(roles []ManagedRole, id string) (ManagedRole, bool) {
	id = util.Clean(id)
	if id == "" {
		id = DefaultManagedRoleID
	}
	for _, role := range roles {
		if role.ID == id {
			return role, true
		}
	}
	return ManagedRole{}, false
}

func managedRoleName(roles []ManagedRole, id string) string {
	if role, ok := managedRoleByIDLocked(roles, id); ok {
		return role.Name
	}
	return defaultManagedRole().Name
}

func managedRoleNameExistsLocked(roles []ManagedRole, exceptID, name string) bool {
	name = strings.TrimSpace(name)
	if name == "" {
		return false
	}
	for _, role := range roles {
		if role.ID != exceptID && strings.EqualFold(role.Name, name) {
			return true
		}
	}
	return false
}

func applyManagedRoleToAuthItem(item *AuthKey, role ManagedRole) {
	if item == nil || util.Clean(item.Role) != AuthRoleUser || role.ID == "" {
		return
	}
	item.RoleID = role.ID
	item.RoleName = role.Name
	item.applyPermissions(role.PermissionSet())
}

func managedRoleUserCountsLocked(items []AuthKey, accounts []PasswordAccount) map[string]int {
	seenUsers := map[string]struct{}{}
	counts := map[string]int{}
	for _, account := range accounts {
		if account.Role != AuthRoleUser || account.ID == "" {
			continue
		}
		key := account.ID + "\x00" + account.ManagedRoleID()
		if _, ok := seenUsers[key]; ok {
			continue
		}
		seenUsers[key] = struct{}{}
		counts[account.ManagedRoleID()]++
	}
	for _, item := range items {
		userID := managedAuthUserID(item)
		if userID == "" {
			continue
		}
		key := userID + "\x00" + managedAuthRoleID(item)
		if _, ok := seenUsers[key]; ok {
			continue
		}
		seenUsers[key] = struct{}{}
		counts[managedAuthRoleID(item)]++
	}
	return counts
}

func storedManagedRole(role ManagedRole) map[string]any {
	return map[string]any{
		"id":              role.ID,
		"name":            role.Name,
		"description":     role.Description,
		"builtin":         role.Builtin,
		"created_at":      role.CreatedAt,
		"updated_at":      role.UpdatedAt,
		"menu_paths":      cloneNonNilStringSlice(role.PermissionSet().MenuPaths),
		"api_permissions": cloneNonNilStringSlice(role.PermissionSet().APIPermissions),
	}
}

func normalizeAuthRole(role string) string {
	switch role {
	case AuthRoleAdmin, AuthRoleUser:
		return role
	default:
		return ""
	}
}

func normalizeAuthKind(kind string) string {
	switch kind {
	case "", AuthKindAPIKey:
		return AuthKindAPIKey
	case AuthKindSession:
		return AuthKindSession
	default:
		return ""
	}
}

func normalizeAuthProvider(provider string) string {
	switch provider {
	case "", AuthProviderLocal:
		return AuthProviderLocal
	default:
		// Unknown historical providers (e.g. removed oauth) collapse to local.
		return AuthProviderLocal
	}
}

func normalizeAuthOwner(owner AuthOwner) AuthOwner {
	owner.ID = util.Clean(owner.ID)
	owner.Name = util.Clean(owner.Name)
	owner.Provider = normalizeAuthProvider(util.Clean(owner.Provider))
	if owner.ID == "" {
		owner.Provider = AuthProviderLocal
	}
	return owner
}

func defaultCredentialName(role, kind string) string {
	if kind == AuthKindSession {
		return "登录会话"
	}
	if role == AuthRoleAdmin {
		return "管理员密钥"
	}
	return "普通用户"
}

func errAuthOwnerRequired() error {
	return authError("需要绑定用户账号")
}

func personalAPIKeyScope(identity Identity) (string, AuthOwner, bool) {
	role := normalizeAuthRole(identity.Role)
	if role == "" {
		return "", AuthOwner{}, false
	}
	ownerID := util.Clean(identity.OwnerID)
	if ownerID == "" {
		return "", AuthOwner{}, false
	}
	owner := normalizeAuthOwner(AuthOwner{
		ID:       ownerID,
		Name:     identity.Name,
		Provider: identity.Provider,
	})
	if owner.Name == "" {
		owner.Name = identity.CredentialName
	}
	if owner.Name == "" {
		owner.Name = owner.ID
	}
	return role, owner, true
}

type authError string

func (e authError) Error() string {
	return string(e)
}
