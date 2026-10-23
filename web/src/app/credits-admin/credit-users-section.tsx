import { LoaderCircle, Minus, Plus, Search, SlidersHorizontal, UserCircle2, X } from "lucide-react";

import { CreditsTablePagination } from "@/app/credits-admin/credits-table-pagination";
import { formatCreditNumber, formatDateTime, type TimeFilter } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CreditUsersSection({ state }: { state: CreditsAdminState }) {
  const hasFilters = Boolean(state.usersSearch.trim()) || state.usersTime !== "all";
  const clearFilters = () => {
    state.setUsersSearch("");
    state.setUsersTime("all");
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-surface-muted/30 px-5 py-3.5 sm:px-5 sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCircle2 className="size-4.5 text-muted-foreground" />
              用户余额
              <Badge variant="secondary" className="rounded-md tabular-nums">
                共 {state.usersTotal} 户
              </Badge>
            </CardTitle>
            <CardDescription>查看积分账户余额并快捷增减指定用户积分。</CardDescription>
          </div>
          {state.permissions.canManageCredits ? (
            <Button type="button" variant="outline" size="xs" onClick={state.openManualAdjustCreditsDialog}>
              <SlidersHorizontal className="size-3.5" />
              指定调账
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="搜索积分用户" value={state.usersSearch} onChange={(event) => state.setUsersSearch(event.target.value)} placeholder="搜索用户 ID 或余额" className="h-9 rounded-lg pl-9" />
          </div>
          <Select value={state.usersTime} onValueChange={(value) => state.setUsersTime(value as TimeFilter)}>
            <SelectTrigger aria-label="积分用户时间筛选" className="h-9 w-full rounded-lg sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部时间</SelectItem><SelectItem value="today">今天</SelectItem><SelectItem value="7d">近 7 天</SelectItem><SelectItem value="30d">近 30 天</SelectItem></SelectContent>
          </Select>
          {hasFilters ? (
            <Button type="button" variant="outline" className="h-9 rounded-lg px-3" onClick={clearFilters}><X className="size-4" />清除</Button>
          ) : null}
        </div>

        {state.isUsersLoading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载用户余额...
          </div>
        ) : state.usersTotal === 0 || state.pagedUsers.items.length === 0 ? (
          <EmptyState
            icon={UserCircle2}
            title={hasFilters ? "没有匹配的积分账户" : "暂无积分账户"}
            description={
              hasFilters
                ? "请尝试调整搜索词或时间筛选条件。"
                : "用户首次签到、兑换卡密或由后台手动发放积分后，将自动建立积分账户。"
            }
            action={
              hasFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  清空筛选条件
                </Button>
              ) : state.permissions.canManageCredits ? (
                <Button type="button" size="sm" onClick={state.openManualAdjustCreditsDialog}>
                  <SlidersHorizontal className="size-4" />
                  调整用户积分
                </Button>
              ) : null
            }
            className="py-14"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-surface-muted/45 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>用户 ID</TableHead>
                    <TableHead>当前余额</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>最近更新</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{renderUserRows(state)}</TableBody>
              </Table>
            </div>
            <CreditsTablePagination label="用户余额" total={state.usersTotal} page={state.pagedUsers.currentPage} pageSize={state.usersPageSize} onPageChange={state.setUsersPage} onPageSizeChange={state.setUsersPageSize} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function renderUserRows(state: CreditsAdminState) {
  return state.pagedUsers.items.map((item) => (
    <TableRow key={item.user_id} className="text-muted-foreground transition-colors hover:bg-surface-hover/60">
      <TableCell className="max-w-[200px] font-mono text-xs text-foreground tabular-nums">{item.user_id}</TableCell>
      <TableCell>
        <Badge variant="default" className="rounded-md tabular-nums">
          {formatCreditNumber(item.balance)} 积分
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatDateTime(item.created_at)}</TableCell>
      <TableCell className="tabular-nums">{formatDateTime(item.updated_at)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-2">
          {state.permissions.canManageCredits ? (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-md px-3" onClick={() => state.openAdjustCreditsDialog(item, "add")}><Plus className="size-4" />加积分</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-md border-rose-500/30 px-3 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => state.openAdjustCreditsDialog(item, "deduct")}><Minus className="size-4" />减积分</Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  ));
}
