import { Eye, LoaderCircle, ReceiptText, RefreshCw, Search, X } from "lucide-react";

import {
  canQueryPaymentOrder,
  formatPaymentAmount,
  paymentChannelDotClass,
  paymentChannelName,
  shortPaymentOrderID,
} from "@/app/payment-admin/payment-order-presentation";
import { StatusBadge } from "@/app/payment-admin/payment-order-status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import type { AdminPaymentOrder, PaymentChannel } from "@/lib/payment-admin-api";

export function PaymentOrdersTable({
  items,
  channels,
  loading,
  hasFilters = false,
  queryingID,
  onOpen,
  onQuery,
  onClearFilters,
}: {
  items: AdminPaymentOrder[];
  channels: PaymentChannel[];
  loading: boolean;
  hasFilters?: boolean;
  queryingID: string;
  onOpen: (item: AdminPaymentOrder) => void;
  onQuery: (item: AdminPaymentOrder) => void;
  onClearFilters?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-border/75 bg-surface text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        正在加载充值订单…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border/75 bg-surface">
        <EmptyState
          icon={hasFilters ? Search : ReceiptText}
          title={hasFilters ? "没有符合筛选条件的订单" : "暂无充值订单流水"}
          description={
            hasFilters
              ? "未找到匹配的订单记录，请尝试清空关键字或切换订单状态筛选。"
              : "用户在充值中心创建支付订单后，所有的交易状态与回调记录将实时汇总在此。"
          }
          action={
            hasFilters && onClearFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                <X className="size-4" />
                清空筛选条件
              </Button>
            ) : null
          }
          className="py-14"
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80">
      <Table className="min-w-[900px]">
        <TableHeader className="bg-surface-muted/45 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead>订单 ID</TableHead>
            <TableHead>订单编号</TableHead>
            <TableHead>实付</TableHead>
            <TableHead>支付方式</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <OrderRow
              key={item.id}
              item={item}
              channels={channels}
              querying={queryingID === item.id}
              onOpen={() => onOpen(item)}
              onQuery={() => onQuery(item)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrderRow({
  item,
  channels,
  querying,
  onQuery,
  onOpen,
}: {
  item: AdminPaymentOrder;
  channels: PaymentChannel[];
  querying: boolean;
  onQuery: () => void;
  onOpen: () => void;
}) {
  return (
    <TableRow className="group transition-colors hover:bg-surface-hover/60">
      <TableCell>
        <button type="button" className="font-semibold tabular-nums transition-colors group-hover:text-foreground" onClick={onOpen}>
          {shortPaymentOrderID(item.id)}
        </button>
      </TableCell>
      <TableCell>
        <button type="button" className="min-w-48 text-left" onClick={onOpen}>
          <div className="flex items-center gap-2 font-medium">
            <span className="truncate font-mono text-xs tabular-nums">{item.out_trade_no}</span>
            <Eye className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.product_name} · {item.user_id}</div>
        </button>
      </TableCell>
      <TableCell>
        <div className="font-semibold tabular-nums">{formatPaymentAmount(item.amount_fen)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{item.credits} 积分</div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className={`size-2 rounded-full ${paymentChannelDotClass(item.channel_id, channels)}`} />
          {paymentChannelName(item.channel_id, channels)}
        </span>
      </TableCell>
      <TableCell><StatusBadge status={item.status} /></TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
        {formatDateTime(item.created_at, { withSeconds: false })}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onOpen}><Eye className="size-3.5" />详情</Button>
          {canQueryPaymentOrder(item.status) ? (
            <Button variant="outline" size="sm" disabled={querying} onClick={onQuery}>
              <RefreshCw className={querying ? "size-3.5 animate-spin" : "size-3.5"} />
              {querying ? "查询中" : "查单"}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
