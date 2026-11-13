import type { ReactNode } from "react";
import { CircleDollarSign, PackageOpen, SlidersHorizontal } from "lucide-react";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
    <section className="rounded-[10px] border border-border/75 bg-surface-subtle/35 p-3.5">
      <SectionTitle
        icon={<PackageOpen className="size-4 text-muted-foreground" />}
        title="基础信息"
      />
      <FieldGroup className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="recharge-product-name">商品名称</FieldLabel>
          <Input
            id="recharge-product-name"
            value={product.name}
            placeholder="例如：100 算力积分包 / 云存储 VIP 月卡"
            onChange={(event) => onChange("name", event.target.value)}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="recharge-product-sku">SKU 编码</FieldLabel>
          <Input
            id="recharge-product-sku"
            value={product.sku}
            className="font-mono text-xs sm:text-[13px]"
            placeholder="例如：credits-100 / vip-cloud-30d"
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
            <SelectTrigger id="recharge-product-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credits">算力积分充值</SelectItem>
              <SelectItem value="cloud_storage">云存储 VIP</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="recharge-product-sort">展示排序</FieldLabel>
          <Input
            id="recharge-product-sort"
            type="number"
            min={0}
            className="tabular-nums"
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
    <section className="rounded-[10px] border border-border/75 bg-surface-subtle/35 p-3.5">
      <SectionTitle
        icon={<CircleDollarSign className="size-4 text-muted-foreground" />}
        title="价格与权益"
      />
      <FieldGroup className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="recharge-product-amount">售价（分）</FieldLabel>
          <Input
            id="recharge-product-amount"
            type="number"
            min={1}
            className="font-mono tabular-nums"
            value={product.amount_fen}
            onChange={(event) =>
              onChange("amount_fen", toNumber(event.target.value))
            }
          />
          <div className="text-[11px] tabular-nums text-muted-foreground">
            前台展示 ¥{(amount / 100).toFixed(2)}
          </div>
        </Field>
        {product.product_type === "credits" ? (
          <Field>
            <FieldLabel htmlFor="recharge-product-credits">
              到账算力积分
            </FieldLabel>
            <Input
              id="recharge-product-credits"
              type="number"
              min={1}
              className="font-mono tabular-nums"
              value={product.credits}
              onChange={(event) =>
                onChange("credits", toNumber(event.target.value))
              }
            />
            <div className="text-[11px] tabular-nums text-muted-foreground">
              折合 ¥{credits > 0 ? (amount / 100 / credits).toFixed(4) : "0.0000"} / 积分
            </div>
          </Field>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="recharge-product-storage-days">
                VIP 有效期（天）
              </FieldLabel>
              <Input
                id="recharge-product-storage-days"
                type="number"
                min={1}
                max={3650}
                className="font-mono tabular-nums"
                value={product.storage_days}
                onChange={(event) =>
                  onChange("storage_days", toNumber(event.target.value))
                }
              />
              <div className="text-[11px] text-muted-foreground">
                付款后实时叠加会员天数
              </div>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="recharge-product-storage-gb">
                云存储容量（GB，0 = 不限容量）
              </FieldLabel>
              <Input
                id="recharge-product-storage-gb"
                type="number"
                min={0}
                className="font-mono tabular-nums"
                value={storageGB}
                onChange={(event) =>
                  onChange(
                    "storage_bytes",
                    Math.max(0, Math.round(toNumber(event.target.value) * 1024 ** 3)),
                  )
                }
              />
              <div className="text-[11px] text-muted-foreground">
                填 0 表示 VIP 有效期内不限容量、不限张数畅存所有生图与视频
              </div>
            </Field>
          </>
        )}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="recharge-product-description">
            商品说明
          </FieldLabel>
          <Textarea
            id="recharge-product-description"
            rows={3}
            value={product.description}
            placeholder="展示在前台充值与权益中心的简短说明"
            onChange={(event) => onChange("description", event.target.value)}
          />
        </Field>
      </FieldGroup>
    </section>
  );
}

export function ProductStatusField({ product, onChange }: ProductFieldsProps) {
  return (
    <section className="rounded-[10px] border border-border/75 bg-surface-subtle/35 p-3.5">
      <SectionTitle
        icon={<SlidersHorizontal className="size-4 text-muted-foreground" />}
        title="上架状态"
      />
      <div
        onClick={() => onChange("enabled", !product.enabled)}
        className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-[8px] border border-border/80 bg-surface px-3.5 py-2.5 transition-colors hover:bg-surface-hover/55"
      >
        <div className="min-w-0 space-y-0.5">
          <label
            htmlFor="recharge-product-enabled"
            onClick={(event) => event.stopPropagation()}
            className="cursor-pointer text-xs font-medium text-foreground sm:text-[13px]"
          >
            对用户显示并允许购买
          </label>
          <p className="text-[11px] text-muted-foreground">
            关闭后前台隐藏该套餐，已购历史订单与存量权益不受影响
          </p>
        </div>
        <Switch
          id="recharge-product-enabled"
          size="sm"
          checked={product.enabled}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => onChange("enabled", checked)}
        />
      </div>
    </section>
  );
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-foreground sm:text-[13px]">
      {icon}
      <span>{title}</span>
    </div>
  );
}
