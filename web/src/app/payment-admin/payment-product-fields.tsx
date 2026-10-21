import type { ReactNode } from "react";
import { CircleDollarSign, PackageOpen, SlidersHorizontal } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RechargeProductInput } from "@/lib/payment-admin-api";

type ProductFieldsProps = {
  product: RechargeProductInput;
  onChange: <K extends keyof RechargeProductInput>(
    key: K,
    value: RechargeProductInput[K],
  ) => void;
};

export function ProductBasicFields({ product, onChange }: ProductFieldsProps) {
  return (
    <section className="rounded-xl border border-border/70 p-4">
      <SectionTitle
        icon={<PackageOpen className="size-4" />}
        title="基础信息"
      />
      <FieldGroup className="mt-4 md:grid md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="recharge-product-name">商品名称</FieldLabel>
          <Input
            id="recharge-product-name"
            value={product.name}
            placeholder="例如 100 积分"
            onChange={(event) => onChange("name", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="recharge-product-sku">SKU</FieldLabel>
          <Input
            id="recharge-product-sku"
            value={product.sku}
            placeholder="例如 credits-100"
            onChange={(event) => onChange("sku", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="recharge-product-type">商品类型</FieldLabel>
          <Select
            value={product.product_type}
            onValueChange={(value) =>
              onChange(
                "product_type",
                value as RechargeProductInput["product_type"],
              )
            }
          >
            <SelectTrigger id="recharge-product-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credits">积分充值</SelectItem>
              <SelectItem value="cloud_storage">云存储</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="recharge-product-sort">展示排序</FieldLabel>
          <Input
            id="recharge-product-sort"
            type="number"
            min={0}
            value={product.sort_order}
            onChange={(event) =>
              onChange("sort_order", toNumber(event.target.value))
            }
          />
        </Field>
      </FieldGroup>
    </section>
  );
}

export function ProductPricingFields({
  product,
  onChange,
}: ProductFieldsProps) {
  const amount = Number(product.amount_fen) || 0;
  const credits = Number(product.credits) || 0;
  const storageGB = Number(product.storage_bytes) / 1024 ** 3 || 0;

  return (
    <section className="rounded-xl border border-border/70 p-4">
      <SectionTitle
        icon={<CircleDollarSign className="size-4" />}
        title="价格与权益"
      />
      <FieldGroup className="mt-4 md:grid md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="recharge-product-amount">售价（分）</FieldLabel>
          <Input
            id="recharge-product-amount"
            type="number"
            min={1}
            value={product.amount_fen}
            onChange={(event) =>
              onChange("amount_fen", toNumber(event.target.value))
            }
          />
          <div className="text-xs text-muted-foreground">
            当前显示 ¥{(amount / 100).toFixed(2)}
          </div>
        </Field>
        {product.product_type === "credits" ? (
          <Field>
            <FieldLabel htmlFor="recharge-product-credits">到账积分</FieldLabel>
            <Input id="recharge-product-credits" type="number" min={1} value={product.credits} onChange={(event) => onChange("credits", toNumber(event.target.value))} />
            <div className="text-xs text-muted-foreground">每积分约 ¥{credits > 0 ? (amount / 100 / credits).toFixed(4) : "0.0000"}</div>
          </Field>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="recharge-product-storage-gb">存储容量（GB）</FieldLabel>
              <Input id="recharge-product-storage-gb" type="number" min={1} value={storageGB} onChange={(event) => onChange("storage_bytes", Math.round(toNumber(event.target.value) * 1024 ** 3))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="recharge-product-storage-days">有效期（天）</FieldLabel>
              <Input id="recharge-product-storage-days" type="number" min={1} max={3650} value={product.storage_days} onChange={(event) => onChange("storage_days", toNumber(event.target.value))} />
            </Field>
          </>
        )}
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="recharge-product-description">
            商品说明
          </FieldLabel>
          <Textarea
            id="recharge-product-description"
            rows={3}
            value={product.description}
            placeholder="展示在用户充值页面的简短说明"
            onChange={(event) => onChange("description", event.target.value)}
          />
        </Field>
      </FieldGroup>
    </section>
  );
}

export function ProductStatusField({ product, onChange }: ProductFieldsProps) {
  return (
    <section className="rounded-xl border border-border/70 p-4">
      <SectionTitle
        icon={<SlidersHorizontal className="size-4" />}
        title="状态"
      />
      <label
        className="mt-4 flex min-h-9 items-center gap-3 rounded-lg border border-border/80 bg-background px-3 text-sm font-medium"
        htmlFor="recharge-product-enabled"
      >
        <Checkbox
          id="recharge-product-enabled"
          checked={product.enabled}
          onCheckedChange={(value) => onChange("enabled", value === true)}
        />
        对用户显示并允许购买
      </label>
    </section>
  );
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      <span>{title}</span>
    </div>
  );
}
