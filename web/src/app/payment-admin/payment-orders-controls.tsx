import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { paymentOrderStatuses, paymentOrderStatusLabels } from "@/app/payment-admin/payment-order-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PaymentOrdersFilters({ keyword, status, onKeywordChange, onStatusChange, onApply }: {
  keyword: string;
  status: string;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="订单搜索" className="min-w-[220px] flex-1" placeholder="订单号、用户或交易号" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onApply(); }} />
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger aria-label="订单状态" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">全部状态</SelectItem>{paymentOrderStatuses.map((value) => <SelectItem key={value} value={value}>{paymentOrderStatusLabels[value]}</SelectItem>)}</SelectContent>
      </Select>
      <Button onClick={onApply}><Search className="size-4" />筛选</Button>
    </div>
  );
}

export function PaymentOrdersPagination({ page, pages, total, pageSize, loading, onPageChange }: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{start === 0 ? "共 0 笔" : `${start}-${end} / 共 ${total} 笔`}</span>
      <div className="flex items-center gap-2">
        <Button aria-label="上一页" variant="outline" size="icon" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}><ChevronLeft className="size-4" /></Button>
        <span className="min-w-16 text-center tabular-nums">{page} / {pages}</span>
        <Button aria-label="下一页" variant="outline" size="icon" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}
