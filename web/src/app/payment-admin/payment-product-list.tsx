import { PackageOpen, Pencil, Plus, Trash2 } from "lucide-react";

import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminRechargeProduct } from "@/lib/payment-admin-api";

export function PaymentProductList({ items, loading, loadError, selectedID, onRetry, onCreate, onEdit, onDelete }: {
  items: AdminRechargeProduct[];
  loading: boolean;
  loadError: string;
  selectedID: string;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (item: AdminRechargeProduct) => void;
  onDelete: (item: AdminRechargeProduct) => void;
}) {
  if (loading) return <PaymentSectionState mode="loading" title="正在加载充值套餐…" />;
  if (loadError) return <PaymentSectionState mode="error" title="充值套餐加载失败" detail={loadError} onRetry={onRetry} />;
  if (items.length === 0) {
    return (
      <PaymentSectionState
        mode="empty"
        icon={PackageOpen}
        title="暂无充值套餐"
        detail="创建算力积分或云存储套餐后，用户即可在前台充值中心选购支付。"
        action={
          <Button type="button" size="sm" onClick={onCreate}>
            <Plus className="size-4" />
            新建充值套餐
          </Button>
        }
      />
    );
  }
  return items.map((item) => (
    <div
      key={item.id}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition sm:flex-row sm:items-center sm:justify-between",
        selectedID === item.id
          ? "border-foreground bg-surface shadow-xs ring-1 ring-foreground/10"
          : "border-border/75 bg-card hover:border-border",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{item.name}</span>
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{item.sku}</code>
          <Badge variant={item.enabled ? "success" : "secondary"} className="rounded-md">
            {item.enabled ? "上架中" : "已停用"}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {item.product_type === "cloud_storage"
            ? `云存储权益 · ${formatStorage(item.storage_bytes)} · ${item.storage_days} 天`
            : `算力积分 · ${item.credits} 积分`}
          {" · "}
          <strong className="font-semibold text-foreground">¥{(item.amount_fen / 100).toFixed(2)}</strong>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}><Pencil className="size-3.5" />编辑</Button>
        <Button type="button" size="sm" variant="destructive-outline" onClick={() => onDelete(item)}><Trash2 className="size-3.5" />删除</Button>
      </div>
    </div>
  ));
}

function formatStorage(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
