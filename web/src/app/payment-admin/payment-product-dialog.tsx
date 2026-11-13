import { Check, LoaderCircle } from "lucide-react";

import {
  ProductBasicFields,
  ProductPricingFields,
  ProductStatusField,
} from "@/app/payment-admin/payment-product-fields";
import { AdminSlideDrawer } from "@/components/admin";
import { Button } from "@/components/ui/button";
import type { RechargeProductInput } from "@/lib/payment-admin-api";

type ProductEditorDialogProps = {
  open: boolean;
  editing: boolean;
  product: RechargeProductInput;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: <K extends keyof RechargeProductInput>(
    key: K,
    value: RechargeProductInput[K],
  ) => void;
  onSave: () => void;
};

export function ProductEditorDialog({
  open,
  editing,
  product,
  saving,
  onOpenChange,
  onChange,
  onSave,
}: ProductEditorDialogProps) {
  return (
    <AdminSlideDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="w-[min(460px,100vw)]"
      title={editing ? "编辑套餐商品" : "新增套餐商品"}
      description={
        editing
          ? "更新套餐定价、权益参数与上架状态后保存即可实时生效。"
          : "按商品类型配置套餐名称、结算价格与对应到账权益。"
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {editing ? "保存修改" : "创建商品"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ProductBasicFields product={product} onChange={onChange} />
        <ProductPricingFields product={product} onChange={onChange} />
        <ProductStatusField product={product} onChange={onChange} />
      </div>
    </AdminSlideDrawer>
  );
}
