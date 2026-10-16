import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import QRCode from "qrcode";

import { Badge } from "@/components/ui/badge";
import { RechargeOrderActions } from "@/app/recharge/recharge-order-actions";
import { paymentOrderStatusLabel } from "@/lib/payment-order-status";
import type { PaymentOrder } from "@/lib/user-admin-api";

type RechargeOrderStatusProps = {
  order: PaymentOrder;
  provider: string;
  querying: boolean;
  cancelling: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onCancel: () => void;
};

export function RechargeOrderStatus({
  order,
  provider,
  querying,
  cancelling,
  onRefresh,
  onReset,
  onCancel,
}: RechargeOrderStatusProps) {
  const success = order.status === "succeeded";
  const terminal = ["closed", "failed", "exception"].includes(order.status);
  const closing = order.status === "closing";
  const expiresAtMs = Date.parse(order.expires_at);
  const [now, setNow] = useState(() => Date.now());
  const finalQueryRequestedRef = useRef(false);
  const remainingMs = Number.isFinite(expiresAtMs)
    ? Math.max(0, expiresAtMs - now)
    : 0;
  const expired = !success && Number.isFinite(expiresAtMs) && remainingMs === 0;
  const qrUnavailable = terminal || closing || expired;
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    finalQueryRequestedRef.current = false;
  }, [order.id]);
  useEffect(() => {
    if (success || terminal || !Number.isFinite(expiresAtMs)) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs, success, terminal]);
  useEffect(() => {
    if (!expired || terminal || finalQueryRequestedRef.current) return;
    finalQueryRequestedRef.current = true;
    onRefresh();
  }, [expired, onRefresh, terminal]);
  useEffect(() => {
    let active = true;
    if (!order.code_url || success || qrUnavailable) {
      setQrCode("");
      return () => {
        active = false;
      };
    }
    void QRCode.toDataURL(order.code_url, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((data) => {
        if (active) setQrCode(data);
      })
      .catch(() => {
        if (active) setQrCode("");
      });
    return () => {
      active = false;
    };
  }, [order.code_url, qrUnavailable, success]);

  const paymentName = provider === "alipay" ? "支付宝" : "微信支付";
  return (
    <section className="mx-auto w-full max-w-2xl rounded-3xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          {success ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <LoaderCircle
              className={
                terminal
                  ? "size-5 text-muted-foreground"
                  : "size-5 animate-spin text-[#1456f0]"
              }
            />
          )}
          {success
            ? "充值已到账"
            : terminal
              ? (order.status === "exception" ? "订单需要核查" : order.status === "failed" ? "订单创建失败" : "订单已关闭")
                : closing
                  ? "正在关闭订单"
                  : expired
                ? "正在确认订单"
                : "等待扫码支付"}
        </div>
        <Badge
          variant={success ? "success" : terminal ? "secondary" : "warning"}
          className="rounded-md"
        >
          {paymentOrderStatusLabel(order.status)}
        </Badge>
      </div>
      {!success && !qrUnavailable ? (
        <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="flex size-56 shrink-0 items-center justify-center rounded-2xl border bg-white p-3">
            {qrCode ? (
              <img
                src={qrCode}
                alt={`${paymentName}支付二维码`}
                className="size-full"
              />
            ) : (
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              请使用{paymentName}扫描二维码完成支付，页面会自动查询到账状态。
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
              <span>支付剩余时间</span>
              <strong className="tabular-nums">
                {formatPaymentCountdown(remainingMs)}
              </strong>
            </div>
            <p className="break-all rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              订单号：{order.out_trade_no}
            </p>
          </div>
        </div>
      ) : null}
      {expired && !terminal && !closing ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          订单已到期，正在确认支付结果并关闭二维码，请勿重复下单。
        </p>
      ) : null}
      {closing ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          支付平台正在确认关单结果，页面会自动更新状态。
        </p>
      ) : null}
      <RechargeOrderActions order={order} querying={querying} cancelling={cancelling} onRefresh={onRefresh} onCancel={onCancel} onReset={onReset} />
      <p className="mt-5 text-xs text-muted-foreground">
        金额 ¥{(order.amount_fen / 100).toFixed(2)} · {order.product_type === "cloud_storage" ? `${order.product_name} · ${order.storage_days ?? 0} 天` : `${order.credits} 积分`}
      </p>
    </section>
  );
}

function formatPaymentCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
