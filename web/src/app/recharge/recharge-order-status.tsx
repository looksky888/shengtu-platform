import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode as QrCodeIcon,
  RefreshCw,
  XCircle,
} from "lucide-react";
import QRCode from "qrcode";

import { RechargeOrderActions } from "@/app/recharge/recharge-order-actions";
import {
  formatPaymentCountdown,
  isExternalHttpPaymentUrl,
} from "@/app/recharge/recharge-order-logic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  paymentOrderStatusLabel,
  paymentOrderStatusVariant,
} from "@/lib/payment-order-status";
import type { PaymentOrder } from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

export type RechargeOrderStatusProps = {
  order: PaymentOrder;
  channelName?: string;
  provider: string;
  pollingError?: string;
  querying: boolean;
  cancelling: boolean;
  embeddedInDialog?: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onCancel: () => void;
  onCancelAndReset?: () => void;
};

function resolveChannelMeta(provider: string, channelName?: string) {
  const custom = channelName?.trim();
  if (provider === "wechatpay") {
    return {
      name: custom || "微信支付",
      badgeStyle: {
        borderColor: "rgba(7, 193, 96, 0.35)",
        backgroundColor: "rgba(7, 193, 96, 0.1)",
        color: "#07C160",
      },
    };
  }
  if (provider === "alipay") {
    return {
      name: custom || "支付宝",
      badgeStyle: {
        borderColor: "rgba(22, 119, 255, 0.35)",
        backgroundColor: "rgba(22, 119, 255, 0.1)",
        color: "#1677FF",
      },
    };
  }
  return {
    name: custom || "官方扫码支付",
    badgeStyle: undefined,
  };
}

export function RechargeOrderStatus({
  order,
  channelName,
  provider,
  pollingError,
  querying,
  cancelling,
  embeddedInDialog = false,
  onRefresh,
  onReset,
  onCancel,
  onCancelAndReset,
}: RechargeOrderStatusProps) {
  const success = order.status === "succeeded";
  const terminal = ["closed", "expired", "failed", "exception"].includes(
    order.status,
  );
  const failedOrException = ["failed", "exception"].includes(order.status);
  const closing = order.status === "closing";
  const expiresAtMs = Date.parse(order.expires_at);
  const [now, setNow] = useState(() => Date.now());
  const finalQueryRequestedRef = useRef(false);

  const remainingMs = Number.isFinite(expiresAtMs)
    ? Math.max(0, expiresAtMs - now)
    : 0;
  const expired = !success && Number.isFinite(expiresAtMs) && remainingMs === 0;
  const qrUnavailable = terminal || closing || expired;

  const [qrState, setQrState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    dataUrl: string;
  }>({ status: "idle", dataUrl: "" });

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
    if (success || qrUnavailable) {
      setQrState({ status: "idle", dataUrl: "" });
      return () => {
        active = false;
      };
    }

    if (!order.code_url || !order.code_url.trim()) {
      setQrState({ status: "error", dataUrl: "" });
      return () => {
        active = false;
      };
    }

    setQrState((prev) =>
      prev.dataUrl ? prev : { status: "loading", dataUrl: "" },
    );
    void QRCode.toDataURL(order.code_url, {
      margin: 2,
      width: 220,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((data) => {
        if (active) {
          setQrState({ status: "ready", dataUrl: data });
        }
      })
      .catch(() => {
        if (active) {
          setQrState({ status: "error", dataUrl: "" });
        }
      });

    return () => {
      active = false;
    };
  }, [order.code_url, qrUnavailable, success]);

  const channelMeta = resolveChannelMeta(provider, channelName);
  const paymentName = channelMeta.name;
  const rewardSummary =
    order.product_type === "cloud_storage"
      ? `${order.product_name || "云存储会员"} · ${order.storage_days ?? 0} 天`
      : `${order.product_name || "积分充值"} · ${order.credits} 积分`;
  const externalHttpUrl = isExternalHttpPaymentUrl(order.code_url)
    ? order.code_url!.trim()
    : "";

  const headingText = success
    ? "支付成功，权益已实时到账"
    : terminal
      ? order.status === "exception"
        ? "订单状态待人工核查"
        : order.status === "failed"
          ? "订单创建或支付失败"
          : order.status === "expired"
            ? "支付二维码已过期"
            : "订单已关闭"
      : closing
        ? "正在确认关闭订单"
        : expired
          ? "倒计时已结束，请确认或重选套餐"
          : "请使用手机扫码完成支付";

  return (
    <section
      className={cn(
        "w-full",
        !embeddedInDialog &&
          "mx-auto max-w-2xl rounded-2xl border border-border/75 bg-card p-5 shadow-2xs",
      )}
    >
      {/* Status Header + Channel Badge + Prominent Amount */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {success ? (
              <CheckCircle2 className="size-5 text-status-success" />
            ) : failedOrException ? (
              <XCircle className="size-5 text-status-danger" />
            ) : terminal || expired ? (
              <Clock className="size-5 text-status-warning" />
            ) : (
              <LoaderCircle className="size-4.5 animate-spin text-primary" />
            )}
            <span className="text-base font-semibold text-foreground">
              {headingText}
            </span>
            <Badge
              variant={paymentOrderStatusVariant(order.status)}
              className="rounded-md"
            >
              {paymentOrderStatusLabel(order.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{rewardSummary}</span>
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={channelMeta.badgeStyle}
            >
              {paymentName}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">应付金额</div>
          <div className="font-mono text-2xl font-bold tracking-tight text-foreground tabular-nums">
            ¥{(order.amount_fen / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Inline Polling Error Warning Alert */}
      {pollingError ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" />
            <span>状态自动同步暂遇网络波动：{pollingError}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={querying || cancelling}
            onClick={onRefresh}
            className="h-7 gap-1"
          >
            <RefreshCw className={cn("size-3", querying && "animate-spin")} />
            重试查询
          </Button>
        </div>
      ) : null}

      {/* Active QR Code Checkout Body */}
      {!success && !qrUnavailable ? (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-surface-subtle/65 p-4 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* Dark-mode protected pure white QR card (no .bg-white class so globals.css .dark override never touches it!) */}
            <div
              data-keep-light="true"
              style={{ backgroundColor: "#ffffff", color: "#111827" }}
              className="flex size-[212px] items-center justify-center rounded-xl border border-slate-200 p-2.5 shadow-xs"
            >
              {qrState.status === "ready" && qrState.dataUrl ? (
                <img
                  src={qrState.dataUrl}
                  alt={`${paymentName}支付二维码`}
                  className="size-full object-contain"
                />
              ) : qrState.status === "error" ? (
                <div className="flex flex-col items-center gap-2 px-3 text-center text-xs leading-relaxed text-rose-600">
                  <AlertCircle className="size-6" />
                  <span>收款码生成异常，请取消后重试或切换支付方式</span>
                </div>
              ) : (
                <LoaderCircle className="size-6 animate-spin text-slate-400" />
              )}
            </div>

            {qrState.status === "ready" && qrState.dataUrl ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <Button variant="outline" size="xs" asChild className="h-7 gap-1 text-[11px]">
                  <a
                    href={qrState.dataUrl}
                    download={`recharge-${order.out_trade_no || order.id}.png`}
                  >
                    <Download className="size-3" />
                    保存收款码
                  </a>
                </Button>
                {externalHttpUrl ? (
                  <Button variant="outline" size="xs" asChild className="h-7 gap-1 text-[11px]">
                    <a
                      href={externalHttpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3" />
                      打开支付链接
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : externalHttpUrl ? (
              <Button variant="outline" size="xs" asChild className="h-7 gap-1 text-[11px]">
                <a
                  href={externalHttpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3" />
                  打开支付链接
                </a>
              </Button>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-3 self-stretch">
            <p className="text-sm leading-relaxed text-muted-foreground">
              请打开<strong className="mx-0.5 font-semibold text-foreground">{paymentName}</strong>
              扫一扫上方二维码完成支付。付款成功后无需手动操作，权益将秒级自动充入账号。
            </p>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/75 bg-card px-3 py-2 text-sm text-foreground">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5 text-primary" />
                支付剩余时间
              </span>
              <strong className="font-mono text-sm font-semibold tabular-nums">
                {formatPaymentCountdown(remainingMs)}
              </strong>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-brand-border/60 bg-brand-soft px-3 py-2 text-xs text-primary">
              <QrCodeIcon className="size-3.5 shrink-0" />
              <span>
                {querying
                  ? "正在向支付网关同步最新到账结果…"
                  : "自动轮询检测中（每 4 秒同步一次到账状态）"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Summary Banner */}
      {success ? (
        <div className="mt-4 rounded-xl border border-status-success/30 bg-status-success-soft px-4 py-3.5 text-sm text-status-success">
          您购买的 <strong>{rewardSummary}</strong> 已发放到账，当前账号可立即使用。
        </div>
      ) : null}

      {/* Countdown Hit 00:00 While Still Pending */}
      {expired && !terminal && !closing ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
        >
          当前订单倒计时已归零。如果您刚刚已完成扫码付款，请点击下方「我已支付，立即同步」核实到账；如未支付，请点击「取消并重选套餐」重新发起订单。
        </div>
      ) : null}

      {closing ? (
        <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
          支付平台正在确认关单结果，页面会自动同步最终状态…
        </div>
      ) : null}

      {/* ALWAYS Copyable Order ID Across EVERY Status */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/45 px-3 py-2 text-xs">
        <span className="min-w-0 break-all font-mono text-muted-foreground tabular-nums">
          订单号：{order.out_trade_no || order.id}
        </span>
        <CopyButton
          value={order.out_trade_no || order.id}
          label="复制订单号"
          copiedLabel="已复制"
          toastMessage="已复制订单号"
          variant="outline"
          className="h-7 shrink-0 px-2.5 text-[11px]"
        />
      </div>

      <RechargeOrderActions
        order={order}
        clientExpired={expired}
        querying={querying}
        cancelling={cancelling}
        onRefresh={onRefresh}
        onCancel={onCancel}
        onCancelAndReset={onCancelAndReset}
        onReset={onReset}
      />
    </section>
  );
}

export function RechargeCheckoutDialog({
  open,
  onOpenChange,
  order,
  channelName,
  provider,
  pollingError,
  querying,
  cancelling,
  onRefresh,
  onReset,
  onCancel,
  onCancelAndReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PaymentOrder | null;
  channelName?: string;
  provider: string;
  pollingError?: string;
  querying: boolean;
  cancelling: boolean;
  onRefresh: () => void;
  onReset: () => void;
  onCancel: () => void;
  onCancelAndReset?: () => void;
}) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-5 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>扫码收银台</DialogTitle>
          <DialogDescription>
            订单号 {order.out_trade_no}，请使用对应支付渠道扫码完成付款
          </DialogDescription>
        </DialogHeader>
        <RechargeOrderStatus
          order={order}
          channelName={channelName}
          provider={provider}
          pollingError={pollingError}
          querying={querying}
          cancelling={cancelling}
          embeddedInDialog
          onRefresh={onRefresh}
          onReset={onReset}
          onCancel={onCancel}
          onCancelAndReset={onCancelAndReset}
        />
      </DialogContent>
    </Dialog>
  );
}
