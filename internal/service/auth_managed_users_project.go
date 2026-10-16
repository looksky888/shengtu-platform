package service

import "chatgpt2api/internal/util"

// projectManagedUsersByIDsLocked builds typed public rows only for the given ids (order preserved).
// No map[string]any intermediate — fill ManagedUserPublic directly.
func projectManagedUsersByIDsLocked(items []AuthKey, roles []ManagedRole, accounts []PasswordAccount, ids []string) []ManagedUserPublic {
	if len(ids) == 0 {
		return []ManagedUserPublic{}
	}
	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if id != "" {
			want[id] = struct{}{}
		}
	}
	byID := map[string]*ManagedUserPublic{}
	for _, account := range accounts {
		if account.Role != AuthRoleUser || account.ID == "" {
			continue
		}
		if _, ok := want[account.ID]; !ok {
			continue
		}
		u := managedUserPublicFromAccount(account, roles)
		byID[account.ID] = &u
	}
	for _, item := range items {
		id := managedAuthUserID(item)
		if id == "" {
			continue
		}
		if _, ok := want[id]; !ok {
			continue
		}
		row := byID[id]
		if row == nil {
			u := managedUserPublicStub(id, item, roles)
			byID[id] = &u
			row = byID[id]
		}
		mergeManagedUserPublic(row, item)
	}
	out := make([]ManagedUserPublic, 0, len(ids))
	for _, id := range ids {
		if user := byID[id]; user != nil {
			out = append(out, *user)
		}
	}
	return out
}

func managedUserPublicFromAccount(account PasswordAccount, roles []ManagedRole) ManagedUserPublic {
	roleID := account.ManagedRoleID()
	roleName := managedRoleName(roles, roleID)
	permissions := DefaultPermissionSetForRole(AuthRoleUser)
	if role, ok := managedRoleByIDLocked(roles, roleID); ok {
		permissions = role.PermissionSet()
	}
	return ManagedUserPublic{
		ID:             account.ID,
		Username:       account.Username,
		Email:          account.Email,
		Name:           account.DisplayName(),
		Role:           AuthRoleUser,
		RoleID:         roleID,
		RoleName:       roleName,
		Provider:       AuthProviderLocal,
		OwnerID:        account.ID,
		OwnerName:      account.DisplayName(),
		Enabled:        account.Enabled,
		CreatedAt:      account.CreatedAt,
		LastUsedAt:     account.LastLoginAt,
		UpdatedAt:      account.UpdatedAt,
		MenuPaths:      append([]string(nil), permissions.MenuPaths...),
		APIPermissions: append([]string(nil), permissions.APIPermissions...),
	}
}

func managedUserPublicStub(id string, item AuthKey, roles []ManagedRole) ManagedUserPublic {
	return ManagedUserPublic{
		ID:             id,
		Name:           managedAuthUserName(item),
		Role:           AuthRoleUser,
		RoleID:         DefaultManagedRoleID,
		RoleName:       managedRoleName(roles, DefaultManagedRoleID),
		Provider:       util.Clean(item.Provider),
		OwnerID:        util.Clean(item.OwnerID),
		OwnerName:      util.Clean(item.OwnerName),
		Enabled:        false,
		MenuPaths:      []string{},
		APIPermissions: []string{},
	}
}

func mergeManagedUserPublic(user *ManagedUserPublic, item AuthKey) {
	if user == nil {
		return
	}
	provider := normalizeAuthProvider(util.Clean(item.Provider))
	if util.Clean(user.Provider) == "" {
		user.Provider = provider
	}
	if ownerID := util.Clean(item.OwnerID); ownerID != "" {
		user.OwnerID = ownerID
	}
	if username := util.Clean(item.Username); username != "" {
		user.Username = username
	}
	if ownerName := util.Clean(item.OwnerName); ownerName != "" {
		user.OwnerName = ownerName
		user.Name = ownerName
	} else if util.Clean(user.Name) == "" {
		user.Name = managedAuthUserName(item)
	}
	if roleID := managedAuthRoleID(item); roleID != "" {
		user.RoleID = roleID
	}
	if roleName := util.Clean(item.RoleName); roleName != "" {
		user.RoleName = roleName
	}
	if item.Enabled {
		user.Enabled = true
	}
	permissions := item.permissions()
	if len(permissions.MenuPaths) > 0 || len(user.MenuPaths) == 0 {
		user.MenuPaths = append([]string(nil), permissions.MenuPaths...)
	}
	if len(permissions.APIPermissions) > 0 || len(user.APIPermissions) == 0 {
		user.APIPermissions = append([]string(nil), permissions.APIPermissions...)
	}
	user.CredentialCount++
	if created := util.Clean(item.CreatedAt); created != "" {
		current := util.Clean(user.CreatedAt)
		if current == "" || created < current {
			user.CreatedAt = created
		}
	}
	if lastUsed := util.Clean(item.LastUsedAt); lastUsed != "" {
		current := util.Clean(user.LastUsedAt)
		if current == "" || lastUsed > current {
			user.LastUsedAt = lastUsed
		}
	}
	if updated := util.Clean(item.UpdatedAt); updated != "" {
		current := util.Clean(user.UpdatedAt)
		if current == "" || updated > current {
			user.UpdatedAt = updated
		}
	}
	switch util.Clean(item.Kind) {
	case AuthKindAPIKey:
		user.HasAPIKey = true
		if util.Clean(user.APIKeyID) == "" {
			user.APIKeyID = util.Clean(item.ID)
			user.APIKeyName = util.Clean(item.Name)
		}
	case AuthKindSession:
		user.HasSession = true
		if util.Clean(user.SessionID) == "" {
			user.SessionID = util.Clean(item.ID)
			user.SessionName = util.Clean(item.Name)
		}
	}
}
