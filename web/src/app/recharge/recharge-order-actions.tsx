import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentOrder } from "@/lib/user-payment-api";

export function RechargeOrderActions({ order, querying, cancelling, onRefresh, onCancel, onReset }: {
  order: PaymentOrder;
  querying: boolean;
  cancelling: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const finished = ["succeeded", "closed", "expired", "failed"].includes(order.status);
  const cancellable = ["created", "pending"].includes(order.status);
  return (
    <div className="mt-5 space-y-3 border-t pt-4">
      {order.status === "exception" ? (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">支付结果需要管理员核查，请保留订单号并联系管理员，避免重复支付。</p>
      ) : null}
      {order.status === "closed" || order.status === "expired" || order.status === "failed" ? (
        <p className="text-sm text-muted-foreground">本次订单已结束，可以重新选择套餐。</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {finished ? <Button onClick={onReset} size="sm">{order.status === "succeeded" ? "返回套餐" : "重新选择套餐"}</Button> : (
          <Button type="button" variant="outline" size="sm" disabled={querying || cancelling} onClick={onRefresh}>
            <RefreshCw className={querying ? "size-3.5 animate-spin" : "size-3.5"} />
            {querying ? "查询中" : "立即查单"}
          </Button>
        )}
        {cancellable ? (
          <Button type="button" variant="ghost" size="sm" disabled={cancelling} onClick={onCancel}>
            <X className="size-3.5" />{cancelling ? "取消中" : "取消支付"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
