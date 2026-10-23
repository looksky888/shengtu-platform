import { Coins, LoaderCircle, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

import { CreditsTablePagination } from "@/app/credits-admin/credits-table-pagination";
import {
  deltaBadgeVariant,
  formatCreditNumber,
  formatDateTime,
  formatSignedDelta,
  type TimeFilter,
} from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { creditReasonLabel } from "@/lib/credit-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CreditLedgerSection({ state }: { state: CreditsAdminState }) {
  const hasFilters = Boolean(state.ledgerSearch.trim()) || state.ledgerReason !== "all" || state.ledgerTime !== "all";
  const clearFilters = () => {
    state.setLedgerSearch("");
    state.setLedgerReason("all");
    state.setLedgerTime("all");
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-surface-muted/30 px-5 py-3.5 sm:px-5 sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4.5 text-muted-foreground" />
              积分流水
              <Badge variant="secondary" className="rounded-md tabular-nums">
                共 {state.ledgerTotal} 笔
              </Badge>
            </CardTitle>
            <CardDescription>服务端分页记录每一笔入账与扣减，正数表示发放或退费，负数表示算力消耗。</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索积分流水"
              value={state.ledgerSearch}
              onChange={(event) => state.setLedgerSearch(event.target.value)}
              placeholder="搜索用户、引用或原因"
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <Select value={state.ledgerReason} onValueChange={state.setLedgerReason}>
            <SelectTrigger aria-label="积分流水原因筛选" className="h-9 w-full rounded-lg sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部原因</SelectItem>
              <SelectItem value="signup">注册奖励</SelectItem>
              <SelectItem value="checkin">每日签到</SelectItem>
              <SelectItem value="card_redeem">卡密兑换</SelectItem>
              <SelectItem value="admin_manual_adjust">后台调账</SelectItem>
              <SelectItem value="image_generation">图片生成</SelectItem>
              <SelectItem value="image_edit">图片编辑</SelectItem>
              <SelectItem value="image_refund">图片返还</SelectItem>
              <SelectItem value="video_generation">视频生成</SelectItem>
              <SelectItem value="video_refund">视频返还</SelectItem>
            </SelectContent>
          </Select>
          <Select value={state.ledgerTime} onValueChange={(value) => state.setLedgerTime(value as TimeFilter)}>
            <SelectTrigger aria-label="积分流水时间筛选" className="h-9 w-full rounded-lg sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-3"
              onClick={clearFilters}
            >
              <X className="size-4" />
              清除
            </Button>
          ) : null}
        </div>

        {state.isLedgerLoading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载积分流水...
          </div>
        ) : state.ledgerError ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2.5 p-6 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">加载积分流水失败</p>
            <p className="max-w-md text-xs">{state.ledgerError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void state.loadLedger()}>
              <RefreshCw className="size-3.5" />
              重试
            </Button>
          </div>
        ) : state.ledger.length === 0 ? (
          <EmptyState
            icon={Coins}
            title={hasFilters ? "没有符合筛选条件的积分流水" : "暂无积分变动流水"}
            description={
              hasFilters
                ? "请尝试调整关键字、原因类型或时间范围筛选。"
                : "当发生每日签到、卡密兑换、创作算力扣费或后台人工调账时，明细将自动记录在此。"
            }
            action={
              hasFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  清空筛选条件
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
                    <TableHead>原因</TableHead>
                    <TableHead>变动</TableHead>
                    <TableHead>余额</TableHead>
                    <TableHead>引用</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{renderLedgerRows(state)}</TableBody>
              </Table>
            </div>
            <CreditsTablePagination
              label="流水"
              total={state.ledgerTotal}
              page={state.pagedLedger.currentPage}
              pageSize={state.ledgerPageSize}
              onPageChange={state.setLedgerPage}
              onPageSizeChange={state.setLedgerPageSize}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function renderLedgerRows(state: CreditsAdminState) {
  return state.ledger.map((entry) => (
    <TableRow key={entry.id} className="text-muted-foreground transition-colors hover:bg-surface-hover/60">
      <TableCell className="max-w-[180px] font-mono text-xs text-foreground tabular-nums">{entry.user_id}</TableCell>
      <TableCell>{creditReasonLabel(entry.reason)}</TableCell>
      <TableCell>
        <Badge variant={deltaBadgeVariant(entry.delta)} className="rounded-md tabular-nums">
          {formatSignedDelta(entry.delta)} 积分
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatCreditNumber(entry.balance_after)} 积分</TableCell>
      <TableCell className="max-w-[180px] font-mono text-xs tabular-nums">{entry.ref_id || "—"}</TableCell>
      <TableCell className="tabular-nums">{formatDateTime(entry.created_at)}</TableCell>
    </TableRow>
  ));
}
