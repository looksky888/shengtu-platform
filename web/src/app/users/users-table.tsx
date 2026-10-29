import { Plus, Search, Users, X } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
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
  hasActiveFilters?: boolean;
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
  onCreateUser?: () => void;
  onClearFilters?: () => void;
  onAdjustCredits: (user: ManagedUser, mode: CreditAdjustMode) => void;
  onRole: (user: ManagedUser) => void;
  onToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
};

const SKELETON_ROW_COUNT = 6;

export function UsersTable(props: UsersTableProps) {
  const {
    users,
    roles,
    pendingIds,
    creditBalanceByUserId,
    permissions,
    hasActiveFilters = false,
    usageReady = true,
    usageByUserId,
    onCreateUser,
    onClearFilters,
  } = props;

  if (props.isLoading) {
    return (
      <Card className="overflow-hidden border-0 shadow-none" aria-busy="true" aria-label="正在加载用户列表">
        <CardContent className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <UsersTableHeader />
              <TableBody>
                {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <Skeleton className="size-8 shrink-0 rounded-lg" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-36" />
                          <Skeleton className="h-2.5 w-24" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-14" />
                        <Skeleton className="h-2.5 w-12" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Skeleton className="h-5 w-16 rounded-md" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-14 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-2.5 w-14" />
                      </div>
                    </TableCell>
                    <TableCell className="w-[216px]">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-11 w-[132px] rounded-lg" />
                        <div className="space-y-1">
                          <Skeleton className="h-2.5 w-12" />
                          <Skeleton className="h-2.5 w-12" />
                          <Skeleton className="h-2.5 w-12" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-2.5 w-24" />
                        <Skeleton className="h-2.5 w-24" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Skeleton className="h-7 w-14 rounded-md" />
                        <Skeleton className="h-7 w-14 rounded-md" />
                        <Skeleton className="h-7 w-12 rounded-md" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={hasActiveFilters ? Search : Users}
        title={hasActiveFilters ? "没有符合筛选条件的用户" : "暂无平台用户"}
        description={
          hasActiveFilters
            ? "未找到匹配的账号记录，请尝试放宽关键字、来源、状态或时间范围筛选。"
            : "当前尚未建立本地用户账号，可立即创建首个本地用户或等待用户自主注册。"
        }
        action={
          hasActiveFilters && onClearFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
              <X className="size-4" />
              清空筛选条件
            </Button>
          ) : permissions.canCreateUser && onCreateUser ? (
            <Button type="button" size="sm" onClick={onCreateUser}>
              <Plus className="size-4" />
              创建首个用户
            </Button>
          ) : null
        }
        className="py-16"
      />
    );
  }

  return (
    <Card className="overflow-hidden border-0 shadow-none">
      <CardContent className="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[1040px]">
            <UsersTableHeader />
            <TableBody>
              {users.map((user) => (
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
              ))}
            </TableBody>
          </Table>
        </div>
        {props.filteredCount > 0 ? <UsersPagination {...props} /> : null}
      </CardContent>
    </Card>
  );
}

function UsersTableHeader() {
  return (
    <TableHeader className="bg-surface-muted/45 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      <TableRow className="hover:bg-transparent">
        <TableHead>用户</TableHead>
        <TableHead>积分</TableHead>
        <TableHead>角色 / 来源</TableHead>
        <TableHead>状态</TableHead>
        <TableHead>额度消耗</TableHead>
        <TableHead className="w-[216px]">调用曲线</TableHead>
        <TableHead>活跃时间</TableHead>
        <TableHead className="w-[210px] text-right">操作</TableHead>
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
