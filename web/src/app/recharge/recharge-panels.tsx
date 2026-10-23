import { ArrowUpRight, Cloud, Coins, CreditCard, History } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PaymentSettings, RechargeProduct } from "@/lib/user-admin-api";

export function RechargeHeaderActions({
  creditBalance,
}: {
  creditBalance: number | null;
}) {
  const formattedBalance =
    typeof creditBalance === "number" && Number.isFinite(creditBalance)
      ? `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(creditBalance)} 积分`
      : "—";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium tabular-nums"
      >
        <Coins className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">当前余额</span>
        <strong className="font-semibold text-foreground">
          {formattedBalance}
        </strong>
      </Badge>
      <Button variant="outline" size="sm" asChild>
        <Link to="/profile?tab=credits">
          <History className="size-3.5 text-muted-foreground" />
          积分明细与卡密兑换
        </Link>
      </Button>
    </div>
  );
}

export function RechargeErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
      {message}
    </div>
  );
}

type ProductTileProps = {
  product: RechargeProduct;
  disabled: boolean;
  onSubmit: (product: RechargeProduct) => void;
};

export function ProductTile({ product, disabled, onSubmit }: ProductTileProps) {
  const isStorage = product.product_type === "cloud_storage";

  return (
    <article className="flex flex-col justify-between gap-4 rounded-xl border border-border/75 bg-card p-5 shadow-2xs transition-colors hover:border-foreground/30">
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
              {isStorage ? (
                <Cloud className="size-4" />
              ) : (
                <Coins className="size-4" />
              )}
            </span>
            <h2 className="truncate font-semibold text-foreground">
              {product.name}
            </h2>
          </div>
          <Badge variant="default" className="shrink-0 rounded-md tabular-nums">
            {isStorage
              ? `${formatStorage(product.storage_bytes || 0)} · ${product.storage_days || 0} 天`
              : `${product.credits} 积分`}
          </Badge>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {product.description || "扫码支付完成后权益自动实时到账"}
        </p>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3.5">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">实付金额</div>
          <strong className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            ¥{(product.amount_fen / 100).toFixed(2)}
          </strong>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => onSubmit(product)}
        >
          <CreditCard className="size-3.5" />
          立即购买
        </Button>
      </div>
    </article>
  );
}

function formatStorage(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

type CustomCreditsPanelProps = {
  settings: PaymentSettings;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onSubmit: () => void;
};

export function CustomCreditsPanel({
  settings,
  value,
  disabled,
  onChange,
  onSubmit,
}: CustomCreditsPanelProps) {
  const presets = [100, 500, 1000, 2000, 5000].filter(
    (item) =>
      item >= settings.min_custom_credits &&
      item <= settings.max_custom_credits,
  );
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  return (
    <section className="rounded-xl border border-border/75 bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            自定义积分充值
          </h2>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            单价 ¥{(settings.credit_unit_price_fen / 100).toFixed(2)} / 积分 ·
            单笔允许范围 {settings.min_custom_credits}–
            {settings.max_custom_credits} 积分
          </p>
        </div>
        {presets.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset)}
                className={cn(
                  "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50",
                  value === preset
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/75 bg-surface-muted/45 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {preset} 积分
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="自定义积分数量"
            type="number"
            min={settings.min_custom_credits}
            max={settings.max_custom_credits}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-9 w-44 tabular-nums"
          />
          <span className="text-xs text-muted-foreground">积分</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground tabular-nums">
            应付合计{" "}
            <strong className="text-lg font-semibold text-foreground">
              ¥{((safeValue * settings.credit_unit_price_fen) / 100).toFixed(2)}
            </strong>
          </div>
          <Button type="button" size="sm" disabled={disabled} onClick={onSubmit}>
            创建扫码订单
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
