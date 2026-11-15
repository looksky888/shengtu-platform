import { ArrowLeft, RefreshCw, X } from "lucide-react";

import { resolveRechargeOrderActionState } from "@/app/recharge/recharge-order-logic";
import { Button } from "@/components/ui/button";
import type { PaymentOrder } from "@/lib/user-payment-api";

export function RechargeOrderActions({
  order,
  clientExpired = false,
  querying,
  cancelling,
  onRefresh,
  onCancel,
  onCancelAndReset,
  onReset,
}: {
  order: PaymentOrder;
  clientExpired?: boolean;
  querying: boolean;
  cancelling: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onCancelAndReset?: () => void;
  onReset: () => void;
}) {
  const actionState = resolveRechargeOrderActionState(order, clientExpired);

  return (
    <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
      {order.status === "exception" ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
        >
          支付结果需要管理员核查，请复制并保留上方订单号联系管理员核实，避免重复支付。您也可以随时返回重选套餐。
        </div>
      ) : null}

      {order.status === "closed" ||
      order.status === "expired" ||
      order.status === "failed" ? (
        <p className="text-xs text-muted-foreground">
          当前订单已结束，您可以返回重新选择充值套餐或切换支付方式。
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {actionState.showReset ? (
          <Button type="button" size="sm" onClick={onReset} className="gap-1.5">
            <ArrowLeft className="size-3.5" />
            {actionState.resetLabel}
          </Button>
        ) : null}

        {actionState.showRefresh ? (
          <Button
            type="button"
            variant={actionState.showReset ? "outline" : "default"}
            size="sm"
            disabled={querying || cancelling}
            onClick={onRefresh}
            className="gap-1.5"
          >
            <RefreshCw
              className={querying ? "size-3.5 animate-spin" : "size-3.5"}
            />
            {querying ? "正在同步…" : actionState.refreshLabel}
          </Button>
        ) : null}

        {actionState.expiredPending ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancelling}
            onClick={onCancelAndReset ?? onCancel}
            className="gap-1.5"
          >
            <X className="size-3.5" />
            {cancelling ? "正在取消…" : actionState.cancelLabel}
          </Button>
        ) : actionState.cancellable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onClick={onCancel}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            {cancelling ? "取消中…" : actionState.cancelLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
