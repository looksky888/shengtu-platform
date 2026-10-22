import { Plus, RefreshCw } from "lucide-react";

import { AdjustCreditsDialog } from "@/app/users/adjust-credits-dialog";
import { CreateUserDialog } from "@/app/users/create-user-dialog";
import { DeleteUserDialog } from "@/app/users/delete-user-dialog";
import { UserRoleDialog } from "@/app/users/user-role-dialog";
import { useUsersManagement } from "@/app/users/use-users-management";
import { UsersFilterBar } from "@/app/users/users-filter-bar";
import { UsersTable } from "@/app/users/users-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { StoredAuthSession } from "@/store/auth";

export function UsersContent({ session }: { session: StoredAuthSession }) {
  const users = useUsersManagement(session);
  const deletingUserPending = users.deletingUser ? users.pendingIds.has(users.deletingUser.id) : false;
  const adjustingBalance = users.adjustingUser ? users.creditBalanceByUserId.get(users.adjustingUser.id) ?? 0 : 0;

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        eyebrow="用户"
        title="用户管理"
        actions={
          <>
            <Button variant="outline" onClick={() => void users.loadUsers()} disabled={users.isLoading} className="h-9 rounded-lg">
              <RefreshCw className={`size-4 ${users.isLoading ? "animate-spin" : ""}`} />
              刷新列表
            </Button>
            <Button
              variant="outline"
              onClick={() => void users.loadUsage()}
              disabled={users.isLoading || users.isLoadingUsage || users.pagedItems.length === 0}
              title={
                users.isLoading
                  ? "列表加载中，请稍候"
                  : users.isLoadingUsage
                    ? "用量统计加载中…"
                    : users.pagedItems.length === 0
                      ? "当前页没有用户，无法加载用量"
                      : users.usageReady
                        ? "重新统计本页用户近 14 天用量"
                        : "按需统计本页用量（打开列表不会扫日志）"
              }
              className="h-9 rounded-lg"
            >
              <RefreshCw className={`size-4 ${users.isLoadingUsage ? "animate-spin" : ""}`} />
              {users.isLoading
                ? "列表加载中"
                : users.isLoadingUsage
                  ? "用量加载中…"
                  : users.pagedItems.length === 0
                    ? "同步状态"
                    : users.usageReady
                      ? "重新加载用量"
                      : "加载用量"}
            </Button>
            {users.permissions.canCreateUser ? (
              <Button onClick={users.openCreateDialog} className="h-9 rounded-lg">
                <Plus className="size-4" />
                创建用户
              </Button>
            ) : null}
          </>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <UsersFilterBar
          totalCount={users.total}
          filteredCount={users.total}
          searchText={users.searchText}
          providerFilter={users.providerFilter}
          statusFilter={users.statusFilter}
          timeFilter={users.timeFilter}
          cleanupFilter={users.cleanupFilter}
          hasActiveFilters={users.hasActiveFilters}
          onSearchTextChange={users.setSearchText}
          onProviderFilterChange={users.setProviderFilter}
          onStatusFilterChange={users.setStatusFilter}
          onTimeFilterChange={users.setTimeFilter}
          onCleanupFilterChange={users.setCleanupFilter}
          onClearFilters={users.clearFilters}
        />
        <UsersTable
          users={users.pagedItems}
          roles={users.roles}
          totalCount={users.total}
          filteredCount={users.total}
          isLoading={users.isLoading}
          usageReady={users.usageReady}
          usageByUserId={users.usageByUserId}
          pendingIds={users.pendingIds}
          creditBalanceByUserId={users.creditBalanceByUserId}
          pageSize={users.pageSize}
          currentPage={users.currentPage}
          totalPages={users.totalPages}
          permissions={users.permissions}
          onPageSizeChange={users.setPageSize}
          onPageChange={users.setPage}
          onAdjustCredits={users.openAdjustCreditsDialog}
          onRole={users.openRoleDialog}
          onToggle={(user) => void users.handleToggle(user)}
          onDelete={(user) => {
            if (!users.permissions.canDeleteUser) return;
            users.setDeletingUser(user);
          }}
        />
      </div>

      <CreateUserDialog
        open={users.isCreateDialogOpen}
        form={users.createForm}
        errors={users.createErrors}
        roles={users.roles}
        isCreating={users.isCreating}
        onOpenChange={users.closeCreateDialog}
        onFieldChange={users.updateCreateField}
        onCreate={() => void users.handleCreate()}
      />
      <UserRoleDialog
        user={users.roleUser}
        roles={users.roles}
        selectedRoleId={users.selectedRoleId}
        isSavingRole={users.isSavingRole}
        onOpenChange={(open) => (!open ? users.setRoleUser(null) : null)}
        onSelectedRoleIdChange={users.setSelectedRoleId}
        onSave={() => void users.handleSaveRole()}
      />
      <DeleteUserDialog
        user={users.deletingUser}
        creditBalance={
          users.deletingUser ? users.creditBalanceByUserId.get(users.deletingUser.id) ?? 0 : 0
        }
        isPending={deletingUserPending}
        onOpenChange={(open) => (!open ? users.setDeletingUser(null) : null)}
        onDelete={() => void users.handleDelete()}
      />
      <AdjustCreditsDialog
        user={users.adjustingUser}
        balance={adjustingBalance}
        delta={users.adjustDelta}
        reason={users.adjustReason}
        isAdjusting={users.isAdjustingCredits}
        onOpenChange={(open) => (!open ? users.closeAdjustCreditsDialog() : null)}
        onDeltaChange={users.setAdjustDelta}
        onReasonChange={users.setAdjustReason}
        onSave={() => void users.handleAdjustCredits()}
      />
    </section>
  );
}