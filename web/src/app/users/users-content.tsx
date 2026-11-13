import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Coins,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { CreateUserDialog } from "@/app/users/create-user-dialog";
import { DeleteUserDialog } from "@/app/users/delete-user-dialog";
import { UserRoleDialog } from "@/app/users/user-role-dialog";
import { UserUsageSparkline } from "@/app/users/user-usage-sparkline";
import { useUsersManagement } from "@/app/users/use-users-management";
import { UsersFilterBar } from "@/app/users/users-filter-bar";
import { UsersTable } from "@/app/users/users-table";
import {
  formatCompactNumber,
  formatCreditNumber,
  formatDateTime,
  formatInactiveDays,
  roleLabel,
  todayCallCount,
} from "@/app/users/users-utils";
import { AdminSlideDrawer, AdminStatusBadge } from "@/components/admin";
import { AdjustCreditsDialog } from "@/components/adjust-credits-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import type { ManagedUser } from "@/lib/api";
import { providerLabel } from "@/lib/provider-label";
import type { StoredAuthSession } from "@/store/auth";

export function UsersContent({
  session,
  embedded = false,
}: {
  session: StoredAuthSession;
  embedded?: boolean;
}) {
  const users = useUsersManagement(session);
  const [inspectingUserId, setInspectingUserId] = useState<string | null>(null);

  const inspectingUser: ManagedUser | null = inspectingUserId
    ? users.pagedItems.find((item) => item.id === inspectingUserId) ?? null
    : null;

  const deletingUserPending = users.deletingUser ? users.pendingIds.has(users.deletingUser.id) : false;
  const adjustingBalance = users.adjustingUser ? users.creditBalanceByUserId.get(users.adjustingUser.id) ?? 0 : 0;

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void users.loadUsers()} disabled={users.isLoading}>
        <RefreshCw className={`size-3.5 ${users.isLoading ? "animate-spin" : ""}`} />
        刷新列表
      </Button>
      <Button
        variant="outline"
        size="sm"
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
      >
        <RefreshCw className={`size-3.5 ${users.isLoadingUsage ? "animate-spin" : ""}`} />
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
        <Button size="sm" onClick={users.openCreateDialog}>
          <Plus className="size-3.5" />
          创建用户
        </Button>
      ) : null}
    </div>
  );

  const inspectingBalance = inspectingUser
    ? (users.creditBalanceByUserId.get(inspectingUser.id) ?? 0)
    : 0;
  const inspectingUsage = inspectingUser
    ? users.usageByUserId?.get(inspectingUser.id)
    : undefined;

  return (
    <section className="flex flex-col gap-4">
      {!embedded ? (
        <PageHeader
          eyebrow="用户与身份"
          title="用户管理"
          badge={
            !users.isLoading ? (
              <Badge variant="secondary" className="rounded-md tabular-nums">
                共 {users.total} 位用户
              </Badge>
            ) : null
          }
          description="统一管理注册账号、角色绑定、积分余额与近 14 日接口调用活跃趋势。"
          actions={toolbarActions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] text-[var(--admin-text-muted)]">
            共 <span className="font-mono font-semibold text-[var(--admin-text)]">{users.total}</span> 位用户 · 点击任意行打开右侧详情抽屉执行调账与角色分配
          </div>
          {toolbarActions}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
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
          hasActiveFilters={users.hasActiveFilters}
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
          onCreateUser={users.openCreateDialog}
          onClearFilters={users.clearFilters}
          onSelectUser={(user) => setInspectingUserId(user.id)}
          onAdjustCredits={users.openAdjustCreditsDialog}
          onRole={users.openRoleDialog}
          onToggle={(user) => void users.handleToggle(user)}
          onDelete={(user) => {
            if (!users.permissions.canDeleteUser) return;
            users.setDeletingUser(user);
          }}
        />
      </div>

      <AdminSlideDrawer
        open={Boolean(inspectingUser)}
        onOpenChange={(open) => {
          if (!open) setInspectingUserId(null);
        }}
        title={inspectingUser ? `用户详情 · ${inspectingUser.name || inspectingUser.username || "普通用户"}` : "用户详情"}
        description={inspectingUser?.email || inspectingUser?.id}
        widthClassName="w-[min(460px,100vw)]"
        footer={
          inspectingUser ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {users.permissions.canAdjustCredits ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => users.openAdjustCreditsDialog(inspectingUser, "add")}
                    >
                      <Coins className="size-3.5" />
                      人工加分
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => users.openAdjustCreditsDialog(inspectingUser, "deduct")}
                    >
                      <Minus className="size-3.5" />
                      扣分
                    </Button>
                  </>
                ) : null}
                {users.permissions.canUpdateUser ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => users.openRoleDialog(inspectingUser)}
                    >
                      <ShieldCheck className="size-3.5" />
                      编辑角色
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={users.pendingIds.has(inspectingUser.id)}
                      onClick={() => void users.handleToggle(inspectingUser)}
                    >
                      {inspectingUser.enabled ? <Ban className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                      {inspectingUser.enabled ? "禁用" : "启用"}
                    </Button>
                  </>
                ) : null}
              </div>
              {users.permissions.canDeleteUser ? (
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="sm"
                  onClick={() => {
                    users.setDeletingUser(inspectingUser);
                    setInspectingUserId(null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {inspectingUser ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                <div className="text-[11px] text-[var(--admin-text-muted)]">当前积分余额</div>
                <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-[var(--admin-text)]">
                  {formatCreditNumber(inspectingBalance)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                <div className="text-[11px] text-[var(--admin-text-muted)]">账户状态 / 角色</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <AdminStatusBadge tone={inspectingUser.enabled ? "success" : "danger"}>
                    {inspectingUser.enabled ? "已启用" : "已禁用"}
                  </AdminStatusBadge>
                  <AdminStatusBadge tone="neutral">
                    {roleLabel(inspectingUser, users.roles)}
                  </AdminStatusBadge>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">用户 ID</span>
                <span className="inline-flex items-center gap-1 font-mono text-[12px] text-[var(--admin-text)]">
                  {inspectingUser.id}
                  <CopyButton value={inspectingUser.id} label="复制用户 ID" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">登录账号</span>
                <span className="font-mono text-[var(--admin-text)]">{inspectingUser.username || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">绑定邮箱</span>
                <span className="text-[var(--admin-text)]">{inspectingUser.email || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">认证来源</span>
                <span className="text-[var(--admin-text)]">{providerLabel(inspectingUser.provider)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">注册时间</span>
                <span className="tabular-nums text-[var(--admin-text)]">{formatDateTime(inspectingUser.created_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--admin-text-muted)]">最近活跃</span>
                <span className="tabular-nums text-[var(--admin-text)]">
                  {formatDateTime(inspectingUser.last_used_at)}（{formatInactiveDays(inspectingUser.inactive_days)}）
                </span>
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--admin-text)]">近 14 日调用活跃趋势</span>
                {!users.usageReady ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={users.isLoadingUsage}
                    onClick={() => void users.loadUsage()}
                  >
                    加载用量
                  </Button>
                ) : null}
              </div>
              {users.usageReady && inspectingUsage ? (
                <div className="space-y-2">
                  <UserUsageSparkline points={inspectingUsage.usage_curve} />
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11.5px] tabular-nums">
                    <div>
                      <div className="text-[var(--admin-text-muted)]">总调用</div>
                      <div className="font-semibold text-[var(--admin-text)]">
                        {formatCompactNumber(inspectingUsage.call_count)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--admin-text-muted)]">今日调用</div>
                      <div className="font-semibold text-[var(--admin-text)]">
                        {formatCompactNumber(todayCallCount(inspectingUsage))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--admin-text-muted)]">失败次数</div>
                      <div className="font-semibold text-[var(--admin-danger)]">
                        {formatCompactNumber(inspectingUsage.failure_count)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-3 text-[12px] text-[var(--admin-text-muted)]">
                  {users.usageReady ? "近 14 日暂无生成或接口调用记录。" : "点击右上角「加载用量」按需聚合该页近 14 日调用统计。"}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </AdminSlideDrawer>

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
        open={Boolean(users.adjustingUser)}
        targetLabel={
          users.adjustingUser?.name ||
          users.adjustingUser?.username ||
          users.adjustingUser?.id
        }
        balance={adjustingBalance}
        mode={users.adjustMode}
        delta={users.adjustDelta}
        reason={users.adjustReason}
        isAdjusting={users.isAdjustingCredits}
        canSubmit={Boolean(users.adjustingUser)}
        onOpenChange={(open) => (!open ? users.closeAdjustCreditsDialog() : null)}
        onModeChange={users.handleAdjustModeChange}
        onDeltaChange={users.setAdjustDelta}
        onReasonChange={users.setAdjustReason}
        onSave={() => void users.handleAdjustCredits()}
      />
    </section>
  );
}
