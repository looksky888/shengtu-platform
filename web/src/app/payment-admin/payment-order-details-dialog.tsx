import { CreditCard, RefreshCw, XCircle } from "lucide-react";

import { PaymentOrderDetailsGrid, PaymentOrderSummary } from "@/app/payment-admin/payment-order-details-content";
import { canQueryPaymentOrder } from "@/app/payment-admin/payment-order-presentation";
import { StatusBadge } from "@/app/payment-admin/payment-order-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AdminPaymentOrder,
  PaymentChannel,
} from "@/lib/payment-admin-api";

type Props = {
  item: AdminPaymentOrder | null;
  channels: PaymentChannel[];
  querying: boolean;
  onClose: () => void;
  onQuery: () => void;
};

export function PaymentOrderDetailsDialog({
  item,
  channels,
  querying,
  onClose,
  onQuery,
}: Props) {
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {item ? (
        <DialogContent className="w-[min(94vw,760px)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 bg-muted/20 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" />
                  订单详情
                </DialogTitle>
                <DialogDescription className="mt-2 font-mono text-xs">
                  {item.out_trade_no}
                </DialogDescription>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <PaymentOrderSummary item={item} channels={channels} />
          </DialogHeader>
          <PaymentOrderDetailsGrid item={item} channels={channels} />
          {item.last_error_message ? (
            <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <XCircle className="size-4" />
                最近一次错误
                {item.last_error_code ? ` · ${item.last_error_code}` : ""}
              </div>
              <p className="mt-1 break-words">{item.last_error_message}</p>
            </div>
          ) : null}
          <DialogFooter className="border-t border-border/70 bg-muted/10 px-6 py-4">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            {canQueryPaymentOrder(item.status) ? (
              <Button onClick={onQuery} disabled={querying}>
                <RefreshCw
                  className={querying ? "size-4 animate-spin" : "size-4"}
                />
                {querying ? "查询中" : "立即查单"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
