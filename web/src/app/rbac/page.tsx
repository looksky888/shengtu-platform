"use client";

import { LoaderCircle, Plus, RefreshCw, Save } from "lucide-react";

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
    <section className="flex flex-col gap-5">
      <PageHeader
        eyebrow="权限"
        title={"\u89d2\u8272\u6743\u9650"}
        actions={
          <>
            <Button variant="outline" onClick={() => void rbac.loadRBAC()} disabled={rbac.isLoading} className="h-10 rounded-lg">
              <RefreshCw className={cn("size-4", rbac.isLoading ? "animate-spin" : "")} />
              {"\u5237\u65b0"}
            </Button>
            <Button onClick={() => rbac.setIsCreateDialogOpen(true)} disabled={rbac.isLoading} className="h-10 rounded-lg">
              <Plus className="size-4" />
              {"\u65b0\u5efa\u89d2\u8272"}
            </Button>
            <Button onClick={() => void rbac.handleSave()} disabled={!rbac.selectedRole || !rbac.isDirty || rbac.isSaving || rbac.isLoading} className="h-10 rounded-lg">
              {rbac.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {"\u4fdd\u5b58"}
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