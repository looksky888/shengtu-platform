import { Pencil, Trash2 } from "lucide-react";

import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import { Button } from "@/components/ui/button";
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
  if (loading) return <PaymentSectionState mode="loading" title="正在加载商品" />;
  if (loadError) return <PaymentSectionState mode="error" title="商品加载失败" detail={loadError} onRetry={onRetry} />;
  if (items.length === 0) return <PaymentSectionState mode="empty" title="暂无商品" action={<Button type="button" variant="outline" onClick={onCreate}>创建第一个商品</Button>} />;
  return items.map((item) => (
    <div key={item.id} className={`flex flex-col gap-3 rounded-xl border p-3 transition sm:flex-row sm:items-center sm:justify-between ${selectedID === item.id ? "border-primary bg-primary/5" : "border-border"}`}>
      <div>
        <div className="font-medium">{item.name} · {item.sku}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {item.product_type === "cloud_storage" ? `云存储 · ${formatStorage(item.storage_bytes)} · ${item.storage_days} 天` : `积分 · ${item.credits} 积分`} · ¥{(item.amount_fen / 100).toFixed(2)} · {item.enabled ? "启用" : "停用"}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}><Pencil className="size-4" />编辑</Button>
        <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDelete(item)}><Trash2 className="size-4" />删除</Button>
      </div>
    </div>
  ));
}

function formatStorage(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
