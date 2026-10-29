import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  normalizeManagedRoles,
  roleSearchText,
  sameStringSet,
  uniqueSortedStrings,
} from "@/app/rbac/rbac-utils";
import {
  createManagedRole,
  deleteManagedRole,
  fetchManagedRoles,
  fetchPermissionCatalog,
  updateManagedRole,
  type ApiPermission,
  type ManagedRole,
  type PermissionMenu,
} from "@/lib/api";

export function useRBACManagement() {
  const selectedRoleIdRef = useRef("");
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [catalog, setCatalog] = useState<{ menus: PermissionMenu[]; apis: ApiPermission[] }>({ menus: [], apis: [] });
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedMenuPaths, setSelectedMenuPaths] = useState<string[]>([]);
  const [selectedApiPermissions, setSelectedApiPermissions] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingRole, setDeletingRole] = useState<ManagedRole | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    selectedRoleIdRef.current = selectedRoleId;
  }, [selectedRoleId]);

  const applySelectedRole = useCallback((role: ManagedRole | null | undefined) => {
    setSelectedRoleId(role?.id || "");
    setRoleName(role?.name || "");
    setRoleDescription(role?.description || "");
    setSelectedMenuPaths(uniqueSortedStrings(role?.menu_paths));
    setSelectedApiPermissions(uniqueSortedStrings(role?.api_permissions));
  }, []);

  const loadRBAC = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rolesData, catalogData] = await Promise.all([fetchManagedRoles(), fetchPermissionCatalog()]);
      const nextRoles = normalizeManagedRoles(rolesData.items);
      setRoles(nextRoles);
      setCatalog({
        menus: Array.isArray(catalogData.menus) ? catalogData.menus : [],
        apis: Array.isArray(catalogData.apis) ? catalogData.apis : [],
      });
      const currentID = selectedRoleIdRef.current;
      applySelectedRole(nextRoles.find((role) => role.id === currentID) || nextRoles[0] || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载角色权限失败");
    } finally {
      setIsLoading(false);
    }
  }, [applySelectedRole]);

  useEffect(() => {
    void loadRBAC();
  }, [loadRBAC]);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) || null, [roles, selectedRoleId]);
  const filteredRoles = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return keyword ? roles.filter((role) => roleSearchText(role).includes(keyword)) : roles;
  }, [roles, searchText]);
  const isDirty = Boolean(selectedRole) && (
    roleName.trim() !== (selectedRole?.name || "")
    || roleDescription.trim() !== (selectedRole?.description || "")
    || !sameStringSet(selectedMenuPaths, selectedRole?.menu_paths)
    || !sameStringSet(selectedApiPermissions, selectedRole?.api_permissions)
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!selectedRole || isSaving) return false;
    const nextName = roleName.trim();
    if (!nextName) {
      toast.error("角色名称不能为空");
      return false;
    }
    setIsSaving(true);
    try {
      const data = await updateManagedRole(selectedRole.id, {
        name: nextName,
        description: roleDescription.trim(),
        menu_paths: selectedMenuPaths,
        api_permissions: selectedApiPermissions,
      });
      const nextRoles = normalizeManagedRoles(data.items);
      setRoles(nextRoles);
      applySelectedRole(nextRoles.find((role) => role.id === data.item.id) || data.item);
      toast.success("角色已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存角色失败");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [applySelectedRole, isSaving, roleDescription, roleName, selectedApiPermissions, selectedMenuPaths, selectedRole]);

  const handleCreate = async () => {
    const nextName = createName.trim();
    if (!nextName) {
      toast.error("角色名称不能为空");
      return;
    }
    setIsCreating(true);
    try {
      const data = await createManagedRole({ name: nextName, description: createDescription.trim() });
      const nextRoles = normalizeManagedRoles(data.items);
      setRoles(nextRoles);
      applySelectedRole(nextRoles.find((role) => role.id === data.item.id) || data.item);
      setCreateName("");
      setCreateDescription("");
      setIsCreateDialogOpen(false);
      toast.success("角色已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建角色失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRole || isDeleting) return;
    setIsDeleting(true);
    try {
      const data = await deleteManagedRole(deletingRole.id);
      const nextRoles = normalizeManagedRoles(data.items);
      setRoles(nextRoles);
      applySelectedRole(nextRoles.find((role) => role.id === selectedRoleId) || nextRoles[0] || null);
      setDeletingRole(null);
      toast.success("角色已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除角色失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    roles,
    catalog,
    selectedRoleId,
    selectedRole,
    roleName,
    roleDescription,
    selectedMenuPaths,
    selectedApiPermissions,
    searchText,
    isLoading,
    isSaving,
    isCreateDialogOpen,
    createName,
    createDescription,
    isCreating,
    deletingRole,
    isDeleting,
    filteredRoles,
    isDirty,
    loadRBAC,
    applySelectedRole,
    setRoleName,
    setRoleDescription,
    setSelectedMenuPaths,
    setSelectedApiPermissions,
    setSearchText,
    setIsCreateDialogOpen,
    setCreateName,
    setCreateDescription,
    setDeletingRole,
    handleSave,
    handleCreate,
    handleDelete,
  };
}
