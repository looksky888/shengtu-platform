import { CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PaymentSettings, RechargeProduct } from "@/lib/user-admin-api";

export function RechargeErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
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
  return (
    <article className="flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-2xs transition hover:border-border hover:shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground">{product.name}</h2>
          <Badge variant="default" className="rounded-md tabular-nums">
            {product.product_type === "cloud_storage" ? `${formatStorage(product.storage_bytes || 0)} · ${product.storage_days || 0} 天` : `${product.credits} 积分`}
          </Badge>
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground">
          {product.description || "即时到账"}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <strong className="text-2xl tracking-tight text-foreground tabular-nums">
          ¥{(product.amount_fen / 100).toFixed(2)}
        </strong>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(product)}
        >
          <CreditCard className="mr-1.5 size-4" />
          购买
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
  return (
    <section className="rounded-xl border border-border/70 bg-card p-5 shadow-2xs">
      <h2 className="text-base font-semibold text-foreground">自定义积分</h2>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        ¥{(settings.credit_unit_price_fen / 100).toFixed(2)} / 积分，范围{" "}
        {settings.min_custom_credits}–{settings.max_custom_credits}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          aria-label="自定义积分数量"
          type="number"
          min={settings.min_custom_credits}
          max={settings.max_custom_credits}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-9 w-44 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
        />
        <strong className="text-foreground tabular-nums">
          合计 ¥{((value * settings.credit_unit_price_fen) / 100).toFixed(2)}
        </strong>
        <Button type="button" disabled={disabled} onClick={onSubmit}>
          创建订单
        </Button>
      </div>
    </section>
  );
}
