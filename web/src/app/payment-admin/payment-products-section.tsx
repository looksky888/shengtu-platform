import { useEffect, useState } from "react";
import { PackageOpen, PackagePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ProductEditorDialog } from "@/app/payment-admin/payment-product-dialog";
import { PaymentProductList } from "@/app/payment-admin/payment-product-list";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createAdminRechargeProduct,
  deleteAdminRechargeProduct,
  emptyRechargeProductInput,
  fetchAdminRechargeProducts,
  updateAdminRechargeProduct,
  type AdminRechargeProduct,
  type RechargeProductInput,
} from "@/lib/payment-admin-api";

export function PaymentProductsSection() {
  const [items, setItems] = useState<AdminRechargeProduct[]>([]);
  const [form, setForm] = useState<RechargeProductInput>(
    emptyRechargeProductInput(),
  );
  const [selected, setSelected] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminRechargeProduct | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setItems((await fetchAdminRechargeProducts()).items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载商品失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const edit = (item: AdminRechargeProduct) => {
    setSelected(item.id);
    setForm({
      sku: item.sku,
      name: item.name,
      description: item.description,
      amount_fen: item.amount_fen,
      credits: item.credits,
      enabled: item.enabled,
      sort_order: item.sort_order,
      product_type: item.product_type,
      storage_days: item.storage_days,
      storage_bytes: item.storage_bytes,
    });
    setEditorOpen(true);
  };

  const openCreate = () => {
    setSelected("");
    setForm(emptyRechargeProductInput());
    setEditorOpen(true);
  };

  const reset = () => {
    setSelected("");
    setForm(emptyRechargeProductInput());
    setEditorOpen(false);
  };

  const update = <K extends keyof RechargeProductInput>(
    key: K,
    value: RechargeProductInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      if (selected) {
        await updateAdminRechargeProduct(selected, form);
        toast.success("商品已更新");
      } else {
        await createAdminRechargeProduct(form);
        toast.success("商品已创建");
      }
      reset();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存商品失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      await deleteAdminRechargeProduct(deleteTarget.id);
      if (selected === deleteTarget.id) reset();
      setDeleteTarget(null);
      await load();
      toast.success("商品已删除，历史订单不受影响");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除商品失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/70 bg-surface-muted/35">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageOpen className="size-4.5 text-muted-foreground" />
                充值套餐管理
                {!loading ? (
                  <Badge variant="secondary" className="rounded-md tabular-nums">
                    共 {items.length} 个套餐
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                配置前台充值中心展示的算力积分包与云存储套餐，支持随时调整排序与上下架状态。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />刷新
              </Button>
              <Button type="button" size="sm" onClick={openCreate}>
                <PackagePlus className="size-4" />新建充值套餐
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-2.5">
            <PaymentProductList items={items} loading={loading} loadError={loadError} selectedID={selected} onRetry={() => void load()} onCreate={openCreate} onEdit={edit} onDelete={setDeleteTarget} />
          </div>
        </CardContent>
      </Card>

      <ProductEditorDialog
        open={editorOpen}
        editing={Boolean(selected)}
        product={form}
        saving={saving}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setSelected("");
        }}
        onChange={update}
        onSave={() => void save()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除商品"
        description={
          <>
            确定删除“{deleteTarget?.name}
            ”吗？商品会立即从用户充值页面移除，历史订单和对账记录会继续保留。
          </>
        }
        confirmLabel="确认删除"
        pendingLabel="删除中…"
        destructive
        pending={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
