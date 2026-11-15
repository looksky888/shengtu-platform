import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Cloud,
  Coins,
  CreditCard,
  Flame,
  Gift,
  History,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  computeProductValueMetrics,
  formatPaymentCountdown,
  isCloudStorageProduct,
  validateCustomCreditsDraft,
} from "@/app/recharge/recharge-order-logic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatStorageQuota } from "@/lib/format";
import type {
  PaymentChannelInfo,
  PaymentOrder,
  PaymentSettings,
  RechargeProduct,
  StorageEntitlement,
} from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

function formatStorage(bytes: number) {
  return formatStorageQuota(bytes, "不限张数");
}

function summarizeStorageStatus(
  cloudStorageEnabled: boolean,
  entitlement: StorageEntitlement | null,
): { label: string; active: boolean; warning: boolean } | null {
  if (!cloudStorageEnabled) return null;
  if (!entitlement) {
    return { label: "云存储 · 普通会员", active: false, warning: false };
  }
  const tier = entitlement.tier;
  const expiresMs = entitlement.expires_at
    ? Date.parse(entitlement.expires_at)
    : Number.NaN;
  const daysLeft = Number.isFinite(expiresMs)
    ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 86_400_000))
    : null;

  if (tier === "grace") {
    return {
      label: "云存储 VIP · 宽限期续费中",
      active: false,
      warning: true,
    };
  }

  if (
    tier === "active" ||
    entitlement.unlimited ||
    entitlement.storage_bytes > 0
  ) {
    const quotaLabel =
      entitlement.unlimited || entitlement.storage_bytes === 0
        ? "不限张数畅存"
        : `${formatStorage(entitlement.used_bytes)} / ${formatStorage(entitlement.storage_bytes)}`;
    const expiryPart =
      daysLeft !== null
        ? daysLeft === 0
          ? " · 今日到期"
          : ` · 剩 ${daysLeft} 天`
        : "";
    return {
      label: `云存储 VIP · ${quotaLabel}${expiryPart}`,
      active: true,
      warning: daysLeft !== null && daysLeft <= 5,
    };
  }

  return {
    label: "云存储 · 可升级 VIP 长期留存",
    active: false,
    warning: false,
  };
}

export function RechargeAccountHeader({
  creditBalance,
  cloudStorageEnabled,
  entitlement,
  onOpenRedeem,
}: {
  creditBalance: number | null;
  cloudStorageEnabled: boolean;
  entitlement: StorageEntitlement | null;
  onOpenRedeem: () => void;
}) {
  const formattedBalance =
    typeof creditBalance === "number" && Number.isFinite(creditBalance)
      ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
          creditBalance,
        )
      : "—";
  const storageSummary = summarizeStorageStatus(
    cloudStorageEnabled,
    entitlement,
  );

  return (
    <header className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              充值中心
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="size-3.5" />
              即时自动到账 · 官方安全通道
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {/* Live Available Credits Pill */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs">
              <Coins className="size-3.5 text-primary" />
              <span className="text-muted-foreground">当前可用积分</span>
              <strong className="font-mono font-semibold text-foreground tabular-nums">
                {formattedBalance}
              </strong>
            </div>

            {/* Cloud Storage Entitlement Status Pill */}
            {storageSummary ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                  storageSummary.warning
                    ? "border-status-warning/30 bg-status-warning-soft text-status-warning"
                    : storageSummary.active
                      ? "border-status-success/30 bg-status-success-soft text-status-success"
                      : "border-border bg-surface-subtle text-muted-foreground",
                )}
              >
                <Cloud className="size-3.5 shrink-0" />
                <span className="font-medium">{storageSummary.label}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenRedeem}
            className="gap-1.5 border-brand-border bg-brand-soft/60 text-primary hover:bg-brand-soft hover:text-primary"
          >
            <Gift className="size-3.5" />
            卡密兑换
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/profile?tab=credits">
              <History className="size-3.5 text-muted-foreground" />
              个人账单明细
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function PendingOrderTopBanner({
  order,
  cancelling,
  onContinue,
  onCancel,
}: {
  order: PaymentOrder;
  cancelling: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const expiresAtMs = Date.parse(order.expires_at);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs]);

  const remainingMs = Number.isFinite(expiresAtMs)
    ? Math.max(0, expiresAtMs - now)
    : 0;
  const countdownText = Number.isFinite(expiresAtMs)
    ? ` · 剩余 ${formatPaymentCountdown(remainingMs)}`
    : "";

  return (
    <div
      role="region"
      aria-label="待支付订单提醒"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/35 bg-brand-soft px-4 py-3 shadow-2xs"
    >
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <QrCode className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-foreground tabular-nums">
            您有一笔待支付订单（¥{(order.amount_fen / 100).toFixed(2)}
            {countdownText}）
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground tabular-nums">
            {order.product_name || "充值套餐"} · 订单号 {order.out_trade_no}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onContinue} className="gap-1.5">
          <QrCode className="size-3.5" />
          继续扫码支付
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancelling}
          onClick={onCancel}
          className="gap-1"
        >
          <X className="size-3.5" />
          {cancelling ? "正在取消…" : "取消订单"}
        </Button>
      </div>
    </div>
  );
}

function ChannelBrandGlyph({ provider }: { provider: string }) {
  if (provider === "wechatpay") {
    return (
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ backgroundColor: "#07C160" }}
        aria-hidden="true"
      >
        微
      </span>
    );
  }
  if (provider === "alipay") {
    return (
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ backgroundColor: "#1677FF" }}
        aria-hidden="true"
      >
        支
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground"
      aria-hidden="true"
    >
      付
    </span>
  );
}

function formatChannelDisplayName(channel: PaymentChannelInfo): string {
  const custom = channel.name?.trim();
  if (custom) return custom;
  if (channel.provider === "wechatpay") return "微信支付";
  if (channel.provider === "alipay") return "支付宝";
  return "在线扫码支付";
}

export function PaymentChannelSelector({
  channels,
  selectedChannelId,
  disabled,
  onSelect,
}: {
  channels: ReadonlyArray<PaymentChannelInfo>;
  selectedChannelId: string;
  disabled: boolean;
  onSelect: (channelId: string) => void;
}) {
  if (channels.length === 0) return null;

  return (
    <div
      role="radiogroup"
      aria-label="选择支付方式"
      className="flex flex-wrap items-center gap-2.5"
    >
      <span className="px-1 text-xs font-medium text-muted-foreground">
        支付方式
      </span>
      {channels.map((channel) => {
        const active = selectedChannelId === channel.id;
        const isWechat = channel.provider === "wechatpay";
        const isAlipay = channel.provider === "alipay";

        return (
          <button
            key={channel.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(channel.id)}
            style={
              active
                ? isWechat
                  ? {
                      borderColor: "#07C160",
                      backgroundColor: "rgba(7, 193, 96, 0.08)",
                    }
                  : isAlipay
                    ? {
                        borderColor: "#1677FF",
                        backgroundColor: "rgba(22, 119, 255, 0.08)",
                      }
                    : undefined
                : undefined
            }
            className={cn(
              "relative inline-flex h-10 items-center gap-2.5 rounded-xl border px-3.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50",
              active
                ? "border-primary bg-brand-soft text-foreground shadow-2xs"
                : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <ChannelBrandGlyph provider={channel.provider} />
            <span className="font-semibold">
              {formatChannelDisplayName(channel)}
            </span>
            {active ? (
              <span
                className="inline-flex size-4 items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: isWechat
                    ? "#07C160"
                    : isAlipay
                      ? "#1677FF"
                      : "var(--primary)",
                }}
              >
                <Check className="size-2.5 stroke-[3]" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function RechargeErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          重新加载
        </Button>
      ) : null}
    </div>
  );
}

export type ProductTileProps = {
  product: RechargeProduct;
  baseUnitPriceFen: number;
  recommendedId: string | null;
  disabled: boolean;
  onSubmit: (product: RechargeProduct) => void;
};

export function ProductTile({
  product,
  baseUnitPriceFen,
  recommendedId,
  disabled,
  onSubmit,
}: ProductTileProps) {
  const isStorage = isCloudStorageProduct(product);
  const metrics = computeProductValueMetrics(
    product,
    baseUnitPriceFen,
    recommendedId,
  );

  return (
    <article
      className={cn(
        "relative flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 transition-all",
        metrics.isRecommended
          ? "border-primary/40 shadow-sm ring-1 ring-primary/15 hover:border-primary/65"
          : "border-border/80 shadow-2xs hover:border-primary/35",
      )}
    >
      {metrics.isRecommended ? (
        <div className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-xs">
          <Flame className="size-3" />
          超值推荐
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                metrics.isRecommended
                  ? "border-brand-border bg-brand-soft text-primary"
                  : "border-border/80 bg-surface-subtle text-foreground",
              )}
            >
              {isStorage ? (
                <Cloud className="size-4.5" />
              ) : (
                <Coins className="size-4.5" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">
                {product.name}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                {metrics.unitRateLabel}
              </p>
            </div>
          </div>

          <Badge
            variant={metrics.isRecommended ? "outline" : "default"}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums",
              metrics.isRecommended &&
                "border-brand-border bg-brand-soft text-primary",
            )}
          >
            {isStorage
              ? `${formatStorage(product.storage_bytes || 0)} · ${product.storage_days || 0} 天`
              : `${new Intl.NumberFormat("zh-CN").format(product.credits)} 积分`}
          </Badge>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {product.description || "扫码支付完成后权益自动秒级充入当前账号"}
        </p>

        {/* Capacity & Savings Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            <Sparkles className="size-3 text-primary" />
            {metrics.capacityHint}
          </span>
          {metrics.savingsPercent !== null ? (
            <span className="inline-flex items-center rounded-md border border-status-success/25 bg-status-success-soft px-2 py-0.5 text-[11px] font-semibold text-status-success tabular-nums">
              立省 {metrics.savingsPercent}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-border/65 pt-4">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">实付金额</div>
          <strong className="font-mono text-2xl font-bold tracking-tight text-foreground tabular-nums">
            ¥{(product.amount_fen / 100).toFixed(2)}
          </strong>
        </div>
        <Button
          type="button"
          size="sm"
          variant={metrics.isRecommended ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onSubmit(product)}
          className={cn(
            "gap-1.5 px-4",
            !metrics.isRecommended &&
              "border-primary/30 text-primary hover:bg-brand-soft hover:text-primary",
          )}
        >
          <CreditCard className="size-3.5" />
          立即购买
        </Button>
      </div>
    </article>
  );
}

type CustomCreditsPanelProps = {
  settings: PaymentSettings;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onSubmit: (credits: number) => void;
};

export function CustomCreditsPanel({
  settings,
  value,
  disabled,
  onChange,
  onSubmit,
}: CustomCreditsPanelProps) {
  const [draftText, setDraftText] = useState(() =>
    Number.isFinite(value) && value > 0 ? String(value) : "",
  );

  useEffect(() => {
    setDraftText((prev) => {
      const trimmed = prev.trim();
      if (trimmed && /^\d+$/.test(trimmed) && Number(trimmed) === value) {
        return prev;
      }
      return Number.isFinite(value) && value > 0 ? String(value) : "";
    });
  }, [value]);

  const presets = useMemo(() => {
    const candidates = [100, 300, 500, 1000, 2000, 5000].filter(
      (item) =>
        item >= settings.min_custom_credits &&
        item <= settings.max_custom_credits,
    );
    if (candidates.length > 0) return candidates;
    if (settings.min_custom_credits > 0) {
      return [settings.min_custom_credits];
    }
    return [];
  }, [settings.max_custom_credits, settings.min_custom_credits]);

  const validation = useMemo(
    () =>
      validateCustomCreditsDraft(
        draftText,
        settings.min_custom_credits,
        settings.max_custom_credits,
        settings.credit_unit_price_fen,
      ),
    [
      draftText,
      settings.credit_unit_price_fen,
      settings.max_custom_credits,
      settings.min_custom_credits,
    ],
  );

  const handleInputChange = (raw: string) => {
    // Strip leading zeros only when followed by other digits ("0200" -> "200"), while letting "" stay ""!
    const cleaned = raw.replace(/\s+/g, "").replace(/^0+(\d)/, "$1");
    setDraftText(cleaned);
    if (/^\d+$/.test(cleaned)) {
      const num = Number(cleaned);
      if (Number.isSafeInteger(num) && num > 0) {
        onChange(num);
      }
    }
  };

  const handleSelectPreset = (preset: number) => {
    setDraftText(String(preset));
    onChange(preset);
  };

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            按需自定义积分充值
          </h2>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            单价 ¥{(settings.credit_unit_price_fen / 100).toFixed(2)} / 积分（折合 ¥
            {settings.credit_unit_price_fen.toFixed(2)} / 百积分）· 单笔允许范围{" "}
            {settings.min_custom_credits}–{settings.max_custom_credits} 积分
          </p>
        </div>

        {presets.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((preset) => {
              const active = validation.numericValue === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/80 bg-surface-subtle text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {preset} 积分
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-border/65 pt-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              aria-label="自定义积分数量"
              aria-invalid={!validation.valid && !validation.isEmpty}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={`${settings.min_custom_credits} - ${settings.max_custom_credits}`}
              value={draftText}
              disabled={disabled}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  validation.valid &&
                  validation.numericValue !== null &&
                  !disabled
                ) {
                  event.preventDefault();
                  onSubmit(validation.numericValue);
                }
              }}
              className={cn(
                "h-9 w-48 font-mono tabular-nums",
                !validation.valid &&
                  !validation.isEmpty &&
                  "border-status-danger focus-visible:ring-status-danger/30",
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              积分
            </span>
            {validation.valid && validation.numericValue ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                （约可生图{" "}
                {Math.max(1, Math.floor(validation.numericValue / 5))} 张）
              </span>
            ) : null}
          </div>

          {validation.errorMessage ? (
            <p
              role={validation.isEmpty ? undefined : "alert"}
              className={cn(
                "text-xs tabular-nums",
                validation.isEmpty
                  ? "text-muted-foreground"
                  : "font-medium text-status-danger",
              )}
            >
              {validation.errorMessage}
            </p>
          ) : (
            <p className="text-xs text-status-success tabular-nums">
              输入数量符合范围，可直接创建扫码订单
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-center">
          <div className="text-sm text-muted-foreground tabular-nums">
            应付合计{" "}
            <strong className="font-mono text-xl font-bold text-foreground">
              ¥{(validation.amountFen / 100).toFixed(2)}
            </strong>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={disabled || !validation.valid || validation.numericValue === null}
            onClick={() => {
              if (validation.valid && validation.numericValue !== null) {
                onSubmit(validation.numericValue);
              }
            }}
            className="gap-1.5"
          >
            创建扫码订单
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
