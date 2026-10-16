import { CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PaymentSettings, RechargeProduct } from "@/lib/user-admin-api";

export function RechargeErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
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
    <article className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{product.name}</h2>
          <Badge variant="info" className="rounded-md">
            {product.product_type === "cloud_storage" ? `${formatStorage(product.storage_bytes || 0)} · ${product.storage_days || 0} 天` : `${product.credits} 积分`}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {product.description || "即时到账"}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <strong className="text-2xl">
          ¥{(product.amount_fen / 100).toFixed(2)}
        </strong>
        <Button
          type="button"
          className="rounded-lg"
          disabled={disabled}
          onClick={() => onSubmit(product)}
        >
          <CreditCard className="mr-2 size-4" />
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
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">自定义积分</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        ¥{(settings.credit_unit_price_fen / 100).toFixed(2)} / 积分，范围{" "}
        {settings.min_custom_credits}–{settings.max_custom_credits}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <input
          aria-label="自定义积分数量"
          type="number"
          min={settings.min_custom_credits}
          max={settings.max_custom_credits}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-44 rounded-xl border border-input bg-background px-4 py-2"
        />
        <strong>
          合计 ¥{((value * settings.credit_unit_price_fen) / 100).toFixed(2)}
        </strong>
        <Button type="button" disabled={disabled} onClick={onSubmit}>
          创建订单
        </Button>
      </div>
    </section>
  );
}
