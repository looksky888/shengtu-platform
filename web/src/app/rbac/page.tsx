"use client";

import { AlertTriangle, LoaderCircle, Plus, RefreshCw, RotateCcw, Save } from "lucide-react";

import { RBACCreateRoleDialog, RBACDeleteRoleDialog } from "@/app/rbac/rbac-role-dialogs";
import { RBACRoleEditorCard } from "@/app/rbac/rbac-role-editor-card";
import { RBACRoleList } from "@/app/rbac/rbac-role-list";
import { useRBACManagement } from "@/app/rbac/use-rbac-management";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

function RBACContent() {
  const rbac = useRBACManagement();
  return (
    <section className="flex flex-col gap-4 pb-4">
      <PageHeader
        eyebrow="权限"
        title="角色权限"
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
              保存
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <RBACRoleList
          roles={rbac.roles}
          filteredRoles={rbac.filteredRoles}
          selectedRoleId={rbac.selectedRoleId}
          searchText={rbac.searchText}
          isLoading={rbac.isLoading}
          onSearchTextChange={rbac.setSearchText}
          onSelectRole={rbac.applySelectedRole}
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
        />
      </div>

      {rbac.isDirty && rbac.selectedRole ? (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <span className="font-medium text-foreground">
              角色「{rbac.selectedRole.name}」有未保存的权限修改
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
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
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  return <RBACContent />;
}