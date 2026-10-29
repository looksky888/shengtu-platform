import { useState } from "react";
import { ChevronDown, History, QrCode, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { paymentOrderStatusLabel } from "@/lib/payment-order-status";
import type { PaymentOrder } from "@/lib/user-admin-api";
import { cn } from "@/lib/utils";

function isOrderResumable(order: PaymentOrder): boolean {
  if (order.status !== "created" && order.status !== "pending") {
    return false;
  }
  const expiresAtMs = Date.parse(order.expires_at);
  return !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now();
}

export function RechargeRecentOrdersPanel({
  orders,
  activeOrderId,
  loading,
  onReload,
  onResumeOrder,
}: {
  orders: PaymentOrder[];
  activeOrderId?: string;
  loading: boolean;
  onReload: () => void;
  onResumeOrder: (order: PaymentOrder) => void;
}) {
  const hasResumablePending = orders.some(
    (item) => item.id !== activeOrderId && isOrderResumable(item),
  );
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isOpen = manualOpen ?? hasResumablePending;

  if (orders.length === 0 && !loading) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border/75 bg-card shadow-2xs">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setManualOpen(!isOpen)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
            <History className="size-4 shrink-0 text-muted-foreground" />
            <span>最近充值订单记录</span>
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
              {orders.length}
            </span>
            {hasResumablePending ? (
              <Badge variant="warning" className="rounded-md text-[10px]">
                有待支付订单
              </Badge>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              isOpen && "rotate-180",
            )}
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onReload}
          disabled={loading}
          className="h-7 gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          <span>刷新</span>
        </Button>
      </div>

      {isOpen ? (
        <div className="divide-y divide-border/65 border-t border-border/65">
          {orders.map((item) => {
            const resumable = item.id !== activeOrderId && isOrderResumable(item);
            const succeeded = item.status === "succeeded";
            const badgeVariant = succeeded
              ? "success"
              : item.status === "created" || item.status === "pending" || item.status === "closing"
                ? "warning"
                : "secondary";
            const rewardText =
              item.product_type === "cloud_storage"
                ? `${item.product_name} · ${item.storage_days ?? 0} 天`
                : `${item.product_name || "积分充值"} · ${item.credits} 积分`;

            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{rewardText}</span>
                    <Badge variant={badgeVariant} className="rounded-md text-[10px]">
                      {paymentOrderStatusLabel(item.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                    <span>订单号 {item.out_trade_no}</span>
                    <span>{formatDateTime(item.created_at, { compact: true })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                    ¥{(item.amount_fen / 100).toFixed(2)}
                  </span>
                  {resumable ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => onResumeOrder(item)}
                      className="h-7 gap-1 rounded-lg px-2.5 text-xs"
                    >
                      <QrCode className="size-3.5" />
                      <span>继续支付</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
