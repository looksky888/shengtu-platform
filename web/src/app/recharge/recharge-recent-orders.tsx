import { useMemo, useState } from "react";
import { ChevronDown, History, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { formatDateTime } from "@/lib/datetime";
import {
  paymentOrderStatusLabel,
  paymentOrderStatusVariant,
} from "@/lib/payment-order-status";
import { queryPaymentOrder, type PaymentOrder } from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

type RecentOrderStatusFilter = "all" | "pending" | "succeeded" | "closed";

function isOrderResumable(order: PaymentOrder): boolean {
  if (order.status !== "created" && order.status !== "pending") {
    return false;
  }
  const expiresAtMs = Date.parse(order.expires_at);
  return !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now();
}

function matchesOrderFilter(
  order: PaymentOrder,
  filter: RecentOrderStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "pending") {
    return ["created", "pending", "closing"].includes(order.status);
  }
  if (filter === "succeeded") {
    return order.status === "succeeded";
  }
  return ["closed", "expired", "failed", "exception", "refunded"].includes(
    order.status,
  );
}

export function RechargeRecentOrdersPanel({
  orders,
  activeOrderId,
  loading,
  onReload,
  onResumeOrder,
  onOrderSynced,
}: {
  orders: PaymentOrder[];
  activeOrderId?: string;
  loading: boolean;
  onReload: () => void;
  onResumeOrder: (order: PaymentOrder) => void;
  onOrderSynced?: (order: PaymentOrder) => void;
}) {
  const hasResumablePending = orders.some(
    (item) => item.id !== activeOrderId && isOrderResumable(item),
  );
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<RecentOrderStatusFilter>("all");
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const isOpen = manualOpen ?? (hasResumablePending || orders.length <= 5);

  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((item) => matchesOrderFilter(item, "pending"))
        .length,
      succeeded: orders.filter((item) => matchesOrderFilter(item, "succeeded"))
        .length,
      closed: orders.filter((item) => matchesOrderFilter(item, "closed")).length,
    }),
    [orders],
  );

  const filteredOrders = useMemo(
    () => orders.filter((item) => matchesOrderFilter(item, statusFilter)),
    [orders, statusFilter],
  );

  const handleSyncSingle = async (item: PaymentOrder) => {
    if (syncingOrderId) return;
    setSyncingOrderId(item.id);
    try {
      const res = await queryPaymentOrder(item.id);
      onOrderSynced?.(res.item);
      if (res.item.status === "succeeded") {
        toast.success("该笔订单已确认支付到账");
      } else {
        toast.info(`已同步状态：${paymentOrderStatusLabel(res.item.status)}`);
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "同步订单状态失败");
    } finally {
      setSyncingOrderId(null);
    }
  };

  if (orders.length === 0 && !loading) {
    return null;
  }

  const filterTabs: Array<{
    key: RecentOrderStatusFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "全部", count: counts.all },
    { key: "pending", label: "待支付", count: counts.pending },
    { key: "succeeded", label: "已完成", count: counts.succeeded },
    { key: "closed", label: "已关闭", count: counts.closed },
  ];

  return (
    <section className="rounded-2xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setManualOpen(!isOpen)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <History className="size-4 shrink-0 text-primary" />
            <span>最近充值订单</span>
            <span className="rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
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
          variant="outline"
          size="xs"
          onClick={onReload}
          disabled={loading}
          className="h-7 gap-1 rounded-lg px-2.5 text-xs"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          <span>同步状态</span>
        </Button>
      </div>

      {isOpen ? (
        <div className="border-t border-border/65">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-surface-subtle/50 px-4 py-2.5 sm:px-5">
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      active ? "opacity-90" : "text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              当前筛选状态下暂无充值订单
            </div>
          ) : (
            <div className="divide-y divide-border/65">
              {filteredOrders.map((item) => {
                const resumable =
                  item.id !== activeOrderId && isOrderResumable(item);
                const canSyncRow = [
                  "created",
                  "pending",
                  "closing",
                  "exception",
                ].includes(item.status);
                const rewardText =
                  item.product_type === "cloud_storage"
                    ? `${item.product_name || "云存储会员"} · ${item.storage_days ?? 0} 天`
                    : `${item.product_name || "积分充值"} · ${item.credits} 积分`;

                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs sm:px-5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {rewardText}
                        </span>
                        <Badge
                          variant={paymentOrderStatusVariant(item.status)}
                          className="rounded-md text-[10px]"
                        >
                          {paymentOrderStatusLabel(item.status)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                        <span>订单号 {item.out_trade_no}</span>
                        <CopyButton
                          value={item.out_trade_no}
                          toastMessage="已复制订单号"
                          title="复制订单号"
                          className="size-5 rounded text-muted-foreground hover:text-foreground"
                        />
                        <span>·</span>
                        <span>
                          {formatDateTime(item.created_at, { compact: true })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-1 font-mono text-sm font-semibold text-foreground tabular-nums">
                        ¥{(item.amount_fen / 100).toFixed(2)}
                      </span>

                      {canSyncRow ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={syncingOrderId === item.id}
                          onClick={() => void handleSyncSingle(item)}
                          className="h-7 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw
                            className={cn(
                              "size-3",
                              syncingOrderId === item.id && "animate-spin",
                            )}
                          />
                          同步状态
                        </Button>
                      ) : null}

                      {resumable ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => onResumeOrder(item)}
                          className="h-7 gap-1 rounded-lg border-primary/35 px-2.5 text-xs text-primary hover:bg-brand-soft hover:text-primary"
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
          )}
        </div>
      ) : null}
    </section>
  );
}
