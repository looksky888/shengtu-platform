import { LoaderCircle, Search, Users } from "lucide-react";

import { UsersTableRow } from "@/app/users/users-table-row";
import {
  USER_TABLE_PAGE_SIZE_OPTIONS,
  type CreditAdjustMode,
  type UserTablePageSize,
} from "@/app/users/users-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ManagedRole, ManagedUser, ManagedUserUsage } from "@/lib/api";

type UsersTablePermissions = {
  canCreateUser: boolean;
  canUpdateUser: boolean;
  canDeleteUser: boolean;
  canAdjustCredits: boolean;
};

type UsersTableProps = {
  users: ManagedUser[];
  roles: ManagedRole[];
  totalCount: number;
  filteredCount: number;
  isLoading: boolean;
  usageReady?: boolean;
  usageByUserId?: Map<string, ManagedUserUsage>;
  pendingIds: Set<string>;
  creditBalanceByUserId: Map<string, number>;
  pageSize: UserTablePageSize;
  currentPage: number;
  totalPages: number;
  permissions: UsersTablePermissions;
  onPageSizeChange: (value: UserTablePageSize) => void;
  onPageChange: (updater: (value: number) => number) => void;
  onAdjustCredits: (user: ManagedUser, mode: CreditAdjustMode) => void;
  onRole: (user: ManagedUser) => void;
  onToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
};

export function UsersTable(props: UsersTableProps) {
  const {
    users,
    roles,
    pendingIds,
    creditBalanceByUserId,
    permissions,
    usageReady = true,
    usageByUserId,
  } = props;
  return (
    <Card className="overflow-hidden border-0 shadow-none">
      <CardContent className="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[1340px]">
            <UsersTableHeader />
            <TableBody>
              {props.isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="py-14 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      <span>正在加载用户列表...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      compact
                      icon={props.totalCount === 0 ? Users : Search}
                      title={props.totalCount === 0 ? "暂无用户" : "没有匹配的用户"}
                      description={
                        props.totalCount === 0
                          ? "创建第一个本地用户或等待新用户注册。"
                          : "请尝试调整搜索词、来源、状态或时间筛选条件。"
                      }
                      className="border-0 bg-transparent py-12"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <UsersTableRow
                    key={user.id}
                    user={user}
                    roles={roles}
                    creditBalance={creditBalanceByUserId.get(user.id) ?? 0}
                    isPending={pendingIds.has(user.id)}
                    usage={usageByUserId?.get(user.id)}
                    usageReady={usageReady}
                    permissions={permissions}
                    onAdjustCredits={props.onAdjustCredits}
                    onRole={props.onRole}
                    onToggle={props.onToggle}
                    onDelete={props.onDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!props.isLoading && props.filteredCount > 0 ? <UsersPagination {...props} /> : null}
      </CardContent>
    </Card>
  );
}

function UsersTableHeader() {
  return (
    <TableHeader className="bg-surface-subtle/80 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      <TableRow className="hover:bg-transparent">
        <TableHead>用户</TableHead>
        <TableHead>积分</TableHead>
        <TableHead>角色</TableHead>
        <TableHead>来源</TableHead>
        <TableHead>状态</TableHead>
        <TableHead>额度消耗</TableHead>
        <TableHead className="w-[340px]">调用曲线</TableHead>
        <TableHead>时间</TableHead>
        <TableHead className="w-[260px] text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function UsersPagination({ pageSize, filteredCount, currentPage, totalPages, onPageSizeChange, onPageChange }: UsersTableProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground tabular-nums">
      <span>{`每页 ${pageSize} 个用户，共 ${filteredCount} 个；第 ${currentPage} / ${totalPages} 页`}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as UserTablePageSize)}>
          <SelectTrigger aria-label="用户列表每页条数" className="h-8 w-[92px] rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>{USER_TABLE_PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{`${size} 条`}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>上一页</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>下一页</Button>
      </div>
    </div>
  );
}
