import { Ban, Copy, KeyRound, LoaderCircle, Search, X } from "lucide-react";

import { CreditsTablePagination } from "@/app/credits-admin/credits-table-pagination";
import { cardStatusVariant, formatCardStatus, formatCreditNumber, formatDateTime, type TimeFilter } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CreditCardsSection({ state }: { state: CreditsAdminState }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 px-5 py-3.5 sm:px-5 sm:py-3.5">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4.5 text-primary" />卡密列表</CardTitle>
          <CardDescription>生成后的明文兑换码只会在弹窗里显示一次，常驻列表仅保留公开字段。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="搜索积分卡密" value={state.cardsSearch} onChange={(event) => state.setCardsSearch(event.target.value)} placeholder="搜索卡密 ID、兑换码或使用用户" className="h-9 rounded-lg pl-9" />
          </div>
          <Select value={state.cardsStatus} onValueChange={state.setCardsStatus}>
            <SelectTrigger aria-label="卡密状态筛选" className="h-9 w-full rounded-lg sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem><SelectItem value="active">未使用</SelectItem><SelectItem value="used">已使用</SelectItem><SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
          <Select value={state.cardsTime} onValueChange={(value) => state.setCardsTime(value as TimeFilter)}>
            <SelectTrigger aria-label="卡密时间筛选" className="h-9 w-full rounded-lg sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem><SelectItem value="today">今天</SelectItem><SelectItem value="7d">近 7 天</SelectItem><SelectItem value="30d">近 30 天</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="h-9 rounded-lg px-3" disabled={!state.cardsSearch.trim() && state.cardsStatus === "all" && state.cardsTime === "all"} onClick={() => { state.setCardsSearch(""); state.setCardsStatus("all"); state.setCardsTime("all"); }}>
            <X className="size-4" />清除
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>卡密 ID</TableHead><TableHead>兑换码</TableHead><TableHead>面值</TableHead><TableHead>状态</TableHead><TableHead>使用用户</TableHead>
                <TableHead>使用时间</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{renderCardRows(state)}</TableBody>
          </Table>
        </div>
        {!state.isCardsLoading && state.cardsTotal > 0 ? <CreditsTablePagination label="卡密" total={state.cardsTotal} page={state.pagedCards.currentPage} pageSize={state.cardsPageSize} onPageChange={state.setCardsPage} onPageSizeChange={state.setCardsPageSize} /> : null}
      </CardContent>
    </Card>
  );
}

function renderCardRows(state: CreditsAdminState) {
  if (state.isCardsLoading) return <CardTableMessage message="正在加载卡密数据..." loading />;
  if (state.cardsTotal === 0) return <CardTableMessage message="暂无卡密记录。" />;
  return state.pagedCards.items.map((card) => (
    <TableRow key={card.id} className="text-muted-foreground">
      <TableCell className="max-w-[220px] font-mono text-xs text-foreground">{card.id}</TableCell>
      <TableCell className="max-w-[280px]">
        {card.key ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1 font-mono text-xs text-foreground">{card.key}</code>
            <Button type="button" variant="outline" className="h-8 rounded-md px-3" onClick={() => void state.handleCopy(card.key || "")}><Copy className="size-4" />复制</Button>
          </div>
        ) : <span className="text-xs text-muted-foreground">历史卡密无明文</span>}
      </TableCell>
      <TableCell>{formatCreditNumber(card.amount)} 积分</TableCell>
      <TableCell><Badge variant={cardStatusVariant(card.status)} className="rounded-md">{formatCardStatus(card.status)}</Badge></TableCell>
      <TableCell className="font-mono text-xs">{card.used_by || "—"}</TableCell>
      <TableCell>{formatDateTime(card.used_at)}</TableCell>
      <TableCell>{formatDateTime(card.created_at)}</TableCell>
      <TableCell>
        <div className="flex justify-end">
          {card.status === "active" && state.permissions.canManageCredits ? (
            <Button type="button" variant="outline" className="h-8 rounded-md px-3" onClick={() => state.setDisablingCard(card)}>
              <Ban className="size-4" />禁用
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  ));
}

function CardTableMessage({ message, loading }: { message: string; loading?: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
        {loading ? <div className="flex items-center justify-center gap-2"><LoaderCircle className="size-4 animate-spin" />{message}</div> : message}
      </TableCell>
    </TableRow>
  );
}
