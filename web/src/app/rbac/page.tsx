"use client";

import { useState } from "react";
import { AlertTriangle, LoaderCircle, Plus, RefreshCw, RotateCcw, Save } from "lucide-react";

import { RBACCreateRoleDialog, RBACDeleteRoleDialog } from "@/app/rbac/rbac-role-dialogs";
import { RBACRoleEditorCard } from "@/app/rbac/rbac-role-editor-card";
import { RBACRoleList } from "@/app/rbac/rbac-role-list";
import { useRBACManagement } from "@/app/rbac/use-rbac-management";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ManagedRole } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import { cn } from "@/lib/utils";

function RBACContent() {
  const rbac = useRBACManagement();
  const [pendingRole, setPendingRole] = useState<ManagedRole | null>(null);
  const hasUnsavedRole = Boolean(rbac.isDirty && rbac.selectedRole);

  const routeGuard = useUnsavedRouteGuard({
    when: hasUnsavedRole,
    onSave: rbac.handleSave,
    onDiscard: () => {
      if (rbac.selectedRole) {
        rbac.applySelectedRole(rbac.selectedRole);
      }
      return true;
    },
  });

  const handleSelectRole = (role: ManagedRole) => {
    if (role.id === rbac.selectedRoleId) return;
    if (hasUnsavedRole) {
      setPendingRole(role);
      return;
    }
    rbac.applySelectedRole(role);
  };

  const handleSaveAndSwitchRole = async () => {
    if (!pendingRole) return;
    const ok = await rbac.handleSave();
    if (!ok) return;
    const target = pendingRole;
    setPendingRole(null);
    rbac.applySelectedRole(target);
  };

  const handleDiscardAndSwitchRole = () => {
    if (!pendingRole) return;
    const target = pendingRole;
    setPendingRole(null);
    rbac.applySelectedRole(target);
  };

  return (
    <section
      className={cn(
        "flex flex-col gap-4",
        hasUnsavedRole ? "pb-24" : "pb-4"
      )}
    >
      <PageHeader
        eyebrow="权限与访问控制"
        title="角色权限"
        badge={
          !rbac.isLoading ? (
            <Badge variant="secondary" className="rounded-md tabular-nums">
              共 {rbac.roles.length} 个角色
            </Badge>
          ) : null
        }
        description="按角色配置菜单访问与后端接口授权，保存后即时生效。"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void rbac.loadRBAC()} disabled={rbac.isLoading}>
              <RefreshCw className={cn("size-4", rbac.isLoading ? "animate-spin" : "")} />
              刷新
            </Button>
            <Button variant="outline" size="sm" onClick={() => rbac.setIsCreateDialogOpen(true)} disabled={rbac.isLoading}>
              <Plus className="size-4" />
              新建角色
            </Button>
            <Button size="sm" onClick={() => void rbac.handleSave()} disabled={!rbac.selectedRole || !rbac.isDirty || rbac.isSaving || rbac.isLoading}>
              {rbac.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存更改
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-4 xl:grid-cols-[228px_minmax(0,1fr)]">
        <RBACRoleList
          roles={rbac.roles}
          filteredRoles={rbac.filteredRoles}
          selectedRoleId={rbac.selectedRoleId}
          searchText={rbac.searchText}
          isLoading={rbac.isLoading}
          onSearchTextChange={rbac.setSearchText}
          onSelectRole={handleSelectRole}
          onCreateRole={() => rbac.setIsCreateDialogOpen(true)}
        />
        <RBACRoleEditorCard
          selectedRole={rbac.selectedRole}
          catalog={rbac.catalog}
          roleName={rbac.roleName}
          roleDescription={rbac.roleDescription}
          selectedMenuPaths={rbac.selectedMenuPaths}
          selectedApiPermissions={rbac.selectedApiPermissions}
          isDirty={rbac.isDirty}
          isLoading={rbac.isLoading}
          onRoleNameChange={rbac.setRoleName}
          onRoleDescriptionChange={rbac.setRoleDescription}
          onMenuPathsChange={rbac.setSelectedMenuPaths}
          onApiPermissionsChange={rbac.setSelectedApiPermissions}
          onDeleteRole={rbac.setDeletingRole}
          onCreateRole={() => rbac.setIsCreateDialogOpen(true)}
        />
      </div>

      {hasUnsavedRole && rbac.selectedRole ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(40rem,calc(100vw-1.5rem))] flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warning/35 bg-surface/95 px-4 py-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-status-warning" />
            <span className="font-medium text-foreground">
              角色「{rbac.selectedRole.name}」有未保存的权限修改
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rbac.isSaving}
              onClick={() => rbac.applySelectedRole(rbac.selectedRole)}
            >
              <RotateCcw className="size-3.5" />
              放弃更改
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={rbac.isSaving || rbac.isLoading}
              onClick={() => void rbac.handleSave()}
            >
              {rbac.isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              保存角色权限
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingRole)}
        tone="warning"
        title="当前角色存在未保存修改"
        description={
          pendingRole && rbac.selectedRole
            ? `即将切换到角色「${pendingRole.name}」，但「${rbac.selectedRole.name}」的权限更改尚未保存。`
            : ""
        }
        cancelLabel="继续编辑"
        secondaryAction={{
          label: "放弃并切换",
          variant: "destructive",
          onClick: handleDiscardAndSwitchRole,
        }}
        confirmLabel="保存并切换"
        pendingLabel="正在保存…"
        pending={rbac.isSaving}
        onClose={() => setPendingRole(null)}
        onConfirm={() => void handleSaveAndSwitchRole()}
      />

      <ConfirmDialog
        open={routeGuard.isOpen}
        tone="warning"
        title="离开角色权限页前是否保存修改？"
        description={
          rbac.selectedRole
            ? `角色「${rbac.selectedRole.name}」的权限配置尚未保存，离开页面将丢失未保存更改。`
            : "当前存在尚未保存的角色权限配置。"
        }
        cancelLabel="继续编辑"
        secondaryAction={{
          label: "放弃修改并离开",
          variant: "destructive",
          pending: routeGuard.isDiscarding,
          onClick: () => void routeGuard.confirmDiscardAndLeave(),
        }}
        confirmLabel="保存并离开"
        pendingLabel="正在保存…"
        pending={routeGuard.isSaving || rbac.isSaving}
        onClose={routeGuard.cancelLeave}
        onConfirm={() => void routeGuard.confirmSaveAndLeave()}
      />

      <RBACCreateRoleDialog
        open={rbac.isCreateDialogOpen}
        createName={rbac.createName}
        createDescription={rbac.createDescription}
        isCreating={rbac.isCreating}
        onOpenChange={rbac.setIsCreateDialogOpen}
        onCreateNameChange={rbac.setCreateName}
        onCreateDescriptionChange={rbac.setCreateDescription}
        onCreate={() => void rbac.handleCreate()}
      />
      <RBACDeleteRoleDialog
        deletingRole={rbac.deletingRole}
        isDeleting={rbac.isDeleting}
        onOpenChange={(open) => (!open ? rbac.setDeletingRole(null) : null)}
        onDelete={() => void rbac.handleDelete()}
      />
    </section>
  );
}

export default function RBACPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/rbac");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <RBACContent />;
}
