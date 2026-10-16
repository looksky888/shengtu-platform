import { Eye, LoaderCircle, RefreshCw } from "lucide-react";

import {
  formatPaymentAmount,
  paymentChannelDotClass,
  paymentChannelName,
  shortPaymentOrderID,
} from "@/app/payment-admin/payment-order-presentation";
import { StatusBadge } from "@/app/payment-admin/payment-order-status-badge";
import { Button } from "@/components/ui/button";
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
  queryingID,
  onOpen,
  onQuery,
}: {
  items: AdminPaymentOrder[];
  channels: PaymentChannel[];
  loading: boolean;
  queryingID: string;
  onOpen: (item: AdminPaymentOrder) => void;
  onQuery: (item: AdminPaymentOrder) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
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
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
                <LoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                暂无符合条件的订单
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <OrderRow
                key={item.id}
                item={item}
                channels={channels}
                querying={queryingID === item.id}
                onOpen={() => onOpen(item)}
                onQuery={() => onQuery(item)}
              />
            ))
          )}
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
    <TableRow className="group">
      <TableCell>
        <button type="button" className="font-semibold tabular-nums transition-colors group-hover:text-primary" onClick={onOpen}>
          {shortPaymentOrderID(item.id)}
        </button>
      </TableCell>
      <TableCell>
        <button type="button" className="min-w-48 text-left" onClick={onOpen}>
          <div className="flex items-center gap-2 font-medium">
            <span className="truncate">{item.out_trade_no}</span>
            <Eye className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.product_name} · {item.user_id}</div>
        </button>
      </TableCell>
      <TableCell>
        <div className="font-semibold tabular-nums">{formatPaymentAmount(item.amount_fen)}</div>
        <div className="text-xs text-muted-foreground">{item.credits} 积分</div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className={`size-2 rounded-full ${paymentChannelDotClass(item.channel_id, channels)}`} />
          {paymentChannelName(item.channel_id, channels)}
        </span>
      </TableCell>
      <TableCell><StatusBadge status={item.status} /></TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDateTime(item.created_at, { withSeconds: false })}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onOpen}><Eye className="size-3.5" />详情</Button>
          <Button variant="outline" size="sm" disabled={querying} onClick={onQuery}>
            <RefreshCw className={querying ? "size-3.5 animate-spin" : "size-3.5"} />
            {querying ? "查询中" : "查单"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
