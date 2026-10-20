import { Coins, LoaderCircle, RefreshCw, Search, X } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CreditLedgerSection({ state }: { state: CreditsAdminState }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="size-5 text-[#1456f0]" />
            积分流水
          </CardTitle>
          <CardDescription>服务端分页；正数表示入账，负数表示扣减。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid gap-2 border-b border-border px-5 py-4 lg:grid-cols-[minmax(14rem,1fr)_140px_140px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索积分流水"
              value={state.ledgerSearch}
              onChange={(event) => state.setLedgerSearch(event.target.value)}
              placeholder="搜索用户、引用或原因"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Select value={state.ledgerReason} onValueChange={state.setLedgerReason}>
            <SelectTrigger aria-label="积分流水原因筛选" className="h-10 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部原因</SelectItem>
              <SelectItem value="signup">注册奖励</SelectItem>
              <SelectItem value="checkin">每日签到</SelectItem>
              <SelectItem value="card_redeem">卡密兑换</SelectItem>
              <SelectItem value="image_generation">图片生成</SelectItem>
              <SelectItem value="image_edit">图片编辑</SelectItem>
              <SelectItem value="image_refund">图片返还</SelectItem>
              <SelectItem value="video_generation">视频生成</SelectItem>
              <SelectItem value="video_refund">视频返还</SelectItem>
            </SelectContent>
          </Select>
          <Select value={state.ledgerTime} onValueChange={(value) => state.setLedgerTime(value as TimeFilter)}>
            <SelectTrigger aria-label="积分流水时间筛选" className="h-10 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-3"
            disabled={!state.ledgerSearch.trim() && state.ledgerReason === "all" && state.ledgerTime === "all"}
            onClick={() => {
              state.setLedgerSearch("");
              state.setLedgerReason("all");
              state.setLedgerTime("all");
            }}
          >
            <X className="size-4" />
            清除
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
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
        {!state.isLedgerLoading && !state.ledgerError && state.ledgerTotal > 0 ? (
          <CreditsTablePagination
            label="流水"
            total={state.ledgerTotal}
            page={state.pagedLedger.currentPage}
            pageSize={state.ledgerPageSize}
            onPageChange={state.setLedgerPage}
            onPageSizeChange={state.setLedgerPageSize}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function renderLedgerRows(state: CreditsAdminState) {
  if (state.isLedgerLoading) return <LedgerTableMessage message="正在加载积分流水..." loading />;
  if (state.ledgerError) {
    return (
      <TableRow>
        <TableCell colSpan={6} className="h-28 text-center">
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm text-foreground">加载失败</p>
            <p className="max-w-md text-sm">{state.ledgerError}</p>
            <Button type="button" variant="outline" className="h-9 rounded-lg px-3" onClick={() => void state.loadLedger()}>
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  if (state.ledger.length === 0) return <LedgerTableMessage message="暂无积分流水。" />;
  return state.ledger.map((entry) => (
    <TableRow key={entry.id} className="text-muted-foreground">
      <TableCell className="max-w-[180px] font-mono text-xs text-foreground">{entry.user_id}</TableCell>
      <TableCell>{creditReasonLabel(entry.reason)}</TableCell>
      <TableCell>
        <Badge variant={deltaBadgeVariant(entry.delta)} className="rounded-md">
          {formatSignedDelta(entry.delta)} 积分
        </Badge>
      </TableCell>
      <TableCell>{formatCreditNumber(entry.balance_after)} 积分</TableCell>
      <TableCell className="max-w-[180px] font-mono text-xs">{entry.ref_id || "—"}</TableCell>
      <TableCell>{formatDateTime(entry.created_at)}</TableCell>
    </TableRow>
  ));
}

function LedgerTableMessage({ message, loading }: { message: string; loading?: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {message}
          </div>
        ) : (
          message
        )}
      </TableCell>
    </TableRow>
  );
}
