import type { ReactNode } from "react";
import { CreditCard, KeyRound, ShieldCheck } from "lucide-react";

import { PaymentCredentialsForm } from "@/app/payment-admin/payment-credentials-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentChannelInput, PaymentCredentialsInput } from "@/lib/payment-admin-api";

export function PaymentChannelEditorFields({
  editing,
  channel,
  credentials,
  onChannelChange,
  onCredentialsChange,
  onRotate,
}: {
  editing: boolean;
  channel: PaymentChannelInput;
  credentials: PaymentCredentialsInput;
  onChannelChange: <K extends keyof PaymentChannelInput>(key: K, value: PaymentChannelInput[K]) => void;
  onCredentialsChange: (key: keyof PaymentCredentialsInput, value: string) => void;
  onRotate: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/70 bg-muted/25 p-4">
        <SectionTitle icon={<CreditCard className="size-4" />} title="基础信息" />
        <FieldGroup className="mt-4 md:grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="payment-channel-provider">支付平台</FieldLabel>
            <Select value={channel.provider} disabled={editing} onValueChange={(value) => onChannelChange("provider", value)}>
              <SelectTrigger id="payment-channel-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wechatpay">微信支付</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-channel-code">渠道 code</FieldLabel>
            <Input id="payment-channel-code" value={channel.code} placeholder="例如 wechat-main" onChange={(event) => onChannelChange("code", event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-channel-name">渠道名称</FieldLabel>
            <Input id="payment-channel-name" value={channel.name} placeholder="例如 微信支付" onChange={(event) => onChannelChange("name", event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-channel-expire">订单有效期（分钟）</FieldLabel>
            <Input id="payment-channel-expire" type="number" min={5} max={120} value={channel.order_expire_minutes} onChange={(event) => onChannelChange("order_expire_minutes", Number(event.target.value))} />
          </Field>
        </FieldGroup>
      </section>
      <section className="rounded-2xl border border-border/70 bg-muted/25 p-4">
        <SectionTitle icon={<ShieldCheck className="size-4" />} title="回调与状态" />
        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="payment-channel-notify">回调公网 HTTPS 基址</FieldLabel>
            <Input id="payment-channel-notify" value={channel.notify_base_url} placeholder="https://pay.example.com" onChange={(event) => onChannelChange("notify_base_url", event.target.value)} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/80 bg-background px-3 text-sm font-medium">
              <Checkbox checked={channel.enabled} onCheckedChange={(value) => onChannelChange("enabled", value === true)} />启用渠道
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/80 bg-background px-3 text-sm font-medium">
              <Checkbox checked={channel.is_default} onCheckedChange={(value) => onChannelChange("is_default", value === true)} />设为默认渠道
            </label>
          </div>
        </FieldGroup>
      </section>
      {editing ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
          <div><div className="font-medium">支付凭据</div><div className="mt-1 text-xs text-muted-foreground">凭据仅显示配置状态，不回显原文。</div></div>
          <Button type="button" variant="outline" onClick={onRotate}><KeyRound className="size-4" />轮换凭据</Button>
        </div>
      ) : (
        <section className="rounded-2xl border border-border/70 bg-muted/25 p-4">
          <SectionTitle icon={<KeyRound className="size-4" />} title={`${channel.provider === "alipay" ? "支付宝" : "微信支付"}凭据`} />
          <div className="mt-4"><PaymentCredentialsForm provider={channel.provider} value={credentials} onChange={onCredentialsChange} /></div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex items-center gap-2 text-sm font-semibold">{icon}<span>{title}</span></div>;
}
