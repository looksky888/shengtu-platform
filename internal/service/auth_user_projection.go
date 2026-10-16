package service

import "chatgpt2api/internal/util"

// managedUserPublicByIDLocked projects a single managed user (typed, no map hop).
func managedUserPublicByIDLocked(items []AuthKey, roles []ManagedRole, accounts []PasswordAccount, id string) (ManagedUserPublic, bool) {
	id = util.Clean(id)
	if id == "" {
		return ManagedUserPublic{}, false
	}
	projected := projectManagedUsersByIDsLocked(items, roles, accounts, []string{id})
	if len(projected) == 0 {
		return ManagedUserPublic{}, false
	}
	return projected[0], true
}

func managedAuthOwnerLocked(items []AuthKey, accounts []PasswordAccount, id string) (AuthOwner, bool) {
	var owner AuthOwner
	found := false
	if account, ok := passwordAccountByIDLocked(accounts, id); ok && account.Role == AuthRoleUser {
		owner.ID = account.ID
		owner.Name = account.DisplayName()
		owner.Provider = AuthProviderLocal
		found = true
	}
	for _, item := range items {
		if managedAuthUserID(item) != id {
			continue
		}
		found = true
		if owner.ID == "" {
			owner.ID = util.Clean(item.OwnerID)
		}
		if owner.Name == "" {
			owner.Name = managedAuthUserName(item)
		}
		if owner.Provider == "" {
			owner.Provider = normalizeAuthProvider(util.Clean(item.Provider))
		}
	}
	return normalizeAuthOwner(owner), found
}

func managedAuthUserID(item AuthKey) string {
	if util.Clean(item.Role) != AuthRoleUser {
		return ""
	}
	if ownerID := util.Clean(item.OwnerID); ownerID != "" {
		return ownerID
	}
	if util.Clean(item.Kind) == AuthKindAPIKey {
		return util.Clean(item.ID)
	}
	return ""
}

func managedAuthUserName(item AuthKey) string {
	if name := util.Clean(item.OwnerName); name != "" {
		return name
	}
	if name := util.Clean(item.Name); name != "" {
		return name
	}
	return "普通用户"
}

func managedAuthRoleID(item AuthKey) string {
	if util.Clean(item.Role) != AuthRoleUser {
		return ""
	}
	roleID := util.Clean(item.RoleID)
	if roleID == "" {
		return DefaultManagedRoleID
	}
	return roleID
}

func managedAuthRoleIDLocked(items []AuthKey, accounts []PasswordAccount, id string) (string, bool) {
	id = util.Clean(id)
	if id == "" {
		return "", false
	}
	if account, ok := passwordAccountByIDLocked(accounts, id); ok && account.Role == AuthRoleUser {
		return account.ManagedRoleID(), true
	}
	for _, item := range items {
		if managedAuthUserID(item) == id {
			return managedAuthRoleID(item), true
		}
	}
	return "", false
}
