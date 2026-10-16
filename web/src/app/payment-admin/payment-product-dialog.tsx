import { Check, LoaderCircle } from "lucide-react";

import {
  ProductBasicFields,
  ProductPricingFields,
  ProductStatusField,
} from "@/app/payment-admin/payment-product-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(94vw,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑充值商品" : "新增充值商品"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "更新商品信息后保存即可生效。"
              : "按商品类型填写名称、价格和到账权益。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <ProductBasicFields product={product} onChange={onChange} />
          <ProductPricingFields product={product} onChange={onChange} />
          <ProductStatusField product={product} onChange={onChange} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {editing ? "保存修改" : "创建商品"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
