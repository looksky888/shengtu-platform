package service

import (
	"chatgpt2api/internal/util"
	"errors"
)

func (s *AuthService) RoleExists(id string) bool {
	id = util.Clean(id)
	if id == "" {
		id = DefaultManagedRoleID
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := managedRoleByIDLocked(s.roles, id)
	return ok
}

func (s *AuthService) CreateRole(input ManagedRoleCreate) (ManagedRolePublic, error) {
	name := util.Clean(input.Name)
	if name == "" {
		return ManagedRolePublic{}, authError("请填写角色名称")
	}
	permissions := DefaultPermissionSetForRole(AuthRoleUser)
	if len(input.MenuPaths) > 0 {
		permissions.MenuPaths = NormalizeMenuPermissions(input.MenuPaths)
	}
	if len(input.APIPermissions) > 0 {
		permissions.APIPermissions = NormalizeManagedRoleAPIPermissions(input.APIPermissions)
	}
	now := util.NowISO()
	role := ManagedRole{
		ID:             "role_" + util.NewHex(10),
		Name:           name,
		Description:    util.Clean(input.Description),
		MenuPaths:      permissions.MenuPaths,
		APIPermissions: permissions.APIPermissions,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if managedRoleNameExistsLocked(s.roles, "", name) {
		return ManagedRolePublic{}, authError("角色名称已存在")
	}
	previousRoles := append([]ManagedRole(nil), s.roles...)
	s.roles = append(s.roles, role)
	sortManagedRoles(s.roles)
	if err := s.saveRolesLocked(); err != nil {
		s.roles = previousRoles
		return ManagedRolePublic{}, authRollbackError(err, s.saveRolesLocked())
	}
	counts := managedRoleUserCountsLocked(s.items, s.accounts)
	return ManagedRolePublicFromRecord(role, counts[role.ID]), nil
}

func (s *AuthService) UpdateRole(id string, updates ManagedRoleUpdate) (ManagedRolePublic, error) {
	id = util.Clean(id)
	if id == "" {
		return ManagedRolePublic{}, authError("请提供角色 ID")
	}
	if !updates.HasFields() {
		return ManagedRolePublic{}, authError("未提供可更新字段")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	previousRoles := append([]ManagedRole(nil), s.roles...)
	previousItems := append([]AuthKey(nil), s.items...)
	for index, role := range s.roles {
		if role.ID != id {
			continue
		}
		next := role
		if updates.Name != nil {
			name := util.Clean(*updates.Name)
			if name == "" {
				return ManagedRolePublic{}, authError("请填写角色名称")
			}
			if managedRoleNameExistsLocked(s.roles, role.ID, name) {
				return ManagedRolePublic{}, authError("角色名称已存在")
			}
			next.Name = name
		}
		if updates.Description != nil {
			next.Description = util.Clean(*updates.Description)
		}
		if updates.MenuPaths != nil {
			next.MenuPaths = NormalizeMenuPermissions(*updates.MenuPaths)
		}
		if updates.APIPermissions != nil {
			next.APIPermissions = NormalizeManagedRoleAPIPermissions(*updates.APIPermissions)
		}
		next.Builtin = role.Builtin
		next.UpdatedAt = util.NowISO()
		s.roles[index] = next
		sortManagedRoles(s.roles)
		for i := range s.items {
			if util.Clean(s.items[i].Role) == AuthRoleUser && managedAuthRoleID(s.items[i]) == next.ID {
				applyManagedRoleToAuthItem(&s.items[i], next)
			}
		}
		if err := s.saveRolesLocked(); err != nil {
			s.roles = previousRoles
			s.items = previousItems
			s.rebuildKeyIndexLocked()
			return ManagedRolePublic{}, authRollbackError(err, s.saveRolesLocked())
		}
		if err := s.saveLocked(); err != nil {
			s.roles = previousRoles
			s.items = previousItems
			s.rebuildKeyIndexLocked()
			rollbackErr := errors.Join(s.saveRolesLocked(), s.saveLocked())
			return ManagedRolePublic{}, authRollbackError(err, rollbackErr)
		}
		counts := managedRoleUserCountsLocked(s.items, s.accounts)
		return ManagedRolePublicFromRecord(next, counts[next.ID]), nil
	}
	return ManagedRolePublic{}, authError("角色不存在")
}

func (s *AuthService) DeleteRole(id string) (bool, error) {
	id = util.Clean(id)
	if id == "" {
		return false, authError("请提供角色 ID")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	role, ok := managedRoleByIDLocked(s.roles, id)
	if !ok {
		return false, nil
	}
	if role.Builtin {
		return false, authError("内置角色不可删除")
	}
	counts := managedRoleUserCountsLocked(s.items, s.accounts)
	if counts[id] > 0 {
		return false, authError("角色仍分配给用户，无法删除")
	}
	previousRoles := append([]ManagedRole(nil), s.roles...)
	next := make([]ManagedRole, 0, len(s.roles)-1)
	for _, item := range s.roles {
		if item.ID != id {
			next = append(next, item)
		}
	}
	s.roles = next
	if err := s.saveRolesLocked(); err != nil {
		s.roles = previousRoles
		return false, authRollbackError(err, s.saveRolesLocked())
	}
	return true, nil
}

// PermissionCatalogPublic is the typed RBAC permission catalog for admin UI.
type PermissionCatalogPublic struct {
	Menus []MenuPermission `json:"menus"`
	APIs  []APIPermission  `json:"apis"`
}

func (s *AuthService) PermissionCatalog() PermissionCatalogPublic {
	return PermissionCatalogPublic{
		Menus: AllMenuPermissions(),
		APIs:  AllAPIPermissions(),
	}
}
