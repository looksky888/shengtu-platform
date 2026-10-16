import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  createEmptyUserForm,
  createUserPayload,
  normalizeCreditUsers,
  validateCreateUserForm,
  type CreateUserErrors,
  type CreateUserForm,
  type CreditAdjustMode,
  type UserCleanupFilter,
} from "@/app/users/users-utils";
import {
  adjustUserCredits,
  createManagedUser,
  deleteManagedUser,
  updateManagedUser,
  type CreditAccount,
  type ManagedRole,
  type ManagedUser,
} from "@/lib/api";

type UserPermissions = {
  canCreateUser: boolean;
  canUpdateUser: boolean;
  canDeleteUser: boolean;
  canAdjustCredits: boolean;
};

type UserActionsOptions = {
  permissions: UserPermissions;
  roles: ManagedRole[];
  /** Current cleanup filter so deletes under cleanup UX are audited with context. */
  cleanupFilter?: UserCleanupFilter;
  loadUsers: () => Promise<void>;
  setItems: Dispatch<SetStateAction<ManagedUser[]>>;
  setCreditUsers: Dispatch<SetStateAction<CreditAccount[]>>;
};

export function useUsersManagementActions(options: UserActionsOptions) {
  const { permissions, roles, cleanupFilter = "all", loadUsers, setItems, setCreditUsers } = options;
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(() => createEmptyUserForm());
  const [createErrors, setCreateErrors] = useState<CreateUserErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [roleUser, setRoleUser] = useState<ManagedUser | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [adjustingUser, setAdjustingUser] = useState<ManagedUser | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("10");
  const [adjustReason, setAdjustReason] = useState("");
  const [isAdjustingCredits, setIsAdjustingCredits] = useState(false);

  const setItemPending = (id: string, isPending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setCreateErrors({});
  };

  const closeAdjustCreditsDialog = () => {
    setAdjustingUser(null);
    setAdjustDelta("10");
    setAdjustReason("");
  };

  const openCreateDialog = () => {
    if (!permissions.canCreateUser) return toast.error("没有创建用户权限");
    setCreateForm(createEmptyUserForm(roles[0]?.id || ""));
    setCreateErrors({});
    setIsCreateDialogOpen(true);
  };

  const updateCreateField = <K extends keyof CreateUserForm>(key: K, value: CreateUserForm[K]) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async () => {
    if (!permissions.canCreateUser) return toast.error("没有创建用户权限");
    const errors = validateCreateUserForm(createForm);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setIsCreating(true);
    try {
      await createManagedUser(createUserPayload(createForm));
      toast.success("用户已创建");
      closeCreateDialog();
      void loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建用户失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (user: ManagedUser) => {
    if (!permissions.canUpdateUser) return toast.error("没有修改用户权限");
    setItemPending(user.id, true);
    try {
      await updateManagedUser(user.id, { enabled: !user.enabled });
      toast.success(user.enabled ? "用户已禁用" : "用户已启用");
      void loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新用户失败");
    } finally {
      setItemPending(user.id, false);
    }
  };

  const openRoleDialog = (user: ManagedUser) => {
    if (!permissions.canUpdateUser) return toast.error("没有修改用户权限");
    setRoleUser(user);
    setSelectedRoleId(user.role_id || roles[0]?.id || "");
  };

  const openAdjustCreditsDialog = (user: ManagedUser, mode: CreditAdjustMode) => {
    if (!permissions.canAdjustCredits) return toast.error("没有调整积分权限");
    setAdjustingUser(user);
    setAdjustDelta(mode === "add" ? "10" : "-10");
    setAdjustReason(mode === "add" ? "后台加积分" : "人工扣减");
  };

  const handleSaveRole = async () => {
    if (!roleUser) return;
    if (!permissions.canUpdateUser) return toast.error("没有修改用户权限");
    setIsSavingRole(true);
    setItemPending(roleUser.id, true);
    try {
      await updateManagedUser(roleUser.id, { role_id: selectedRoleId });
      toast.success("角色已更新");
      setRoleUser(null);
      void loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新角色失败");
    } finally {
      setIsSavingRole(false);
      setItemPending(roleUser.id, false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    if (!permissions.canDeleteUser) return toast.error("没有删除用户权限");
    const user = deletingUser;
    setItemPending(user.id, true);
    try {
      const audit =
        cleanupFilter === "inactive15_or_credit0"
          ? { cleanup: "inactive15_or_credit0" as const }
          : cleanupFilter === "inactive15"
            ? { inactive_days_min: 15 }
            : cleanupFilter === "credit0"
              ? { credit_max: 0 }
              : undefined;
      await deleteManagedUser(user.id, audit);
      setDeletingUser(null);
      toast.success("用户已删除");
      void loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除用户失败");
    } finally {
      setItemPending(user.id, false);
    }
  };

  const handleAdjustCredits = async () => {
    if (!adjustingUser) return;
    if (!permissions.canAdjustCredits) return toast.error("没有调整积分权限");
    const delta = Math.trunc(Number(adjustDelta));
    if (!Number.isFinite(delta) || delta === 0) return toast.error("请输入非 0 的积分调整值");
    const user = adjustingUser;
    setIsAdjustingCredits(true);
    setItemPending(user.id, true);
    try {
      const data = await adjustUserCredits(user.id, delta, adjustReason.trim() || undefined);
      const nextBalance = data.account?.balance;
      setCreditUsers((current) => {
        const list = normalizeCreditUsers(current);
        const index = list.findIndex((item) => item.user_id === user.id);
        if (typeof nextBalance !== "number") return list;
        if (index >= 0) {
          const copy = list.slice();
          copy[index] = { ...copy[index], balance: nextBalance };
          return copy;
        }
        return [...list, { user_id: user.id, balance: nextBalance, created_at: "", updated_at: "" }];
      });
      setItems((current) =>
        current.map((item) =>
          item.id === user.id && typeof nextBalance === "number" ? { ...item, credit_balance: nextBalance } : item,
        ),
      );
      closeAdjustCreditsDialog();
      toast.success(delta > 0 ? "积分已增加" : "积分已扣减");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "调整积分失败");
    } finally {
      setIsAdjustingCredits(false);
      setItemPending(user.id, false);
    }
  };

  return {
    pendingIds,
    isCreateDialogOpen,
    createForm,
    createErrors,
    isCreating,
    deletingUser,
    roleUser,
    selectedRoleId,
    isSavingRole,
    adjustingUser,
    adjustDelta,
    adjustReason,
    isAdjustingCredits,
    openCreateDialog,
    closeCreateDialog,
    updateCreateField,
    handleCreate,
    handleToggle,
    openRoleDialog,
    openAdjustCreditsDialog,
    handleSaveRole,
    handleDelete,
    handleAdjustCredits,
    setDeletingUser,
    setRoleUser,
    setSelectedRoleId,
    setAdjustDelta,
    setAdjustReason,
    closeAdjustCreditsDialog,
  };
}
