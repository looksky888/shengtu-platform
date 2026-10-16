import { Timer } from "lucide-react";

import { formatPaymentAmount, paymentChannelName } from "@/app/payment-admin/payment-order-presentation";
import { formatDateTime } from "@/lib/datetime";
import type { AdminPaymentOrder, PaymentChannel } from "@/lib/payment-admin-api";

export function PaymentOrderDetailsGrid({ item, channels }: { item: AdminPaymentOrder; channels: PaymentChannel[] }) {
  const orderFields: Array<[string, string | undefined]> = [
    ["订单 ID", item.id],
    ["用户", item.user_id],
    ["订单号", item.out_trade_no],
    ["商品", item.product_name],
    ["支付方式", paymentChannelName(item.channel_id, channels)],
    ["交易号", item.transaction_id || "—"],
  ];
  const timingFields: Array<[string, string | undefined]> = [
    ["订单有效期", item.expires_at],
    ["创建时间", item.created_at],
    ["支付时间", item.paid_at],
    ["到账时间", item.credited_at],
    ["关闭时间", item.closed_at],
  ];
  return (
    <div className="max-h-[62vh] space-y-5 overflow-y-auto px-6 py-5">
      <DetailSection title="订单信息" fields={orderFields} monoKeys={["订单 ID", "订单号", "交易号"]} />
      <DetailSection title="时间线" fields={timingFields.map(([label, value]) => [label, formatDateTime(value)])} />
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Timer className="size-4 text-muted-foreground" />上游诊断</div>
        <div className="grid gap-3 rounded-xl border border-border bg-muted/15 p-4 sm:grid-cols-3">
          <Metric label="查单次数" value={`${item.query_attempts} 次`} />
          <Metric label="上游状态" value={item.provider_trade_desc || item.provider_trade_state || "—"} />
          <Metric label="请求 ID" value={item.provider_request_id || "—"} mono />
        </div>
      </section>
    </div>
  );
}

export function PaymentOrderSummary({ item, channels }: { item: AdminPaymentOrder; channels: PaymentChannel[] }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
      <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
        <div className="text-xs text-muted-foreground">实付金额</div>
        <div className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums">{formatPaymentAmount(item.amount_fen)}</div>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
        <div className="text-xs text-muted-foreground">到账积分</div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{item.credits.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">积分</span></div>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
        <div className="text-xs text-muted-foreground">支付渠道</div>
        <div className="mt-2 flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full bg-primary" />{paymentChannelName(item.channel_id, channels)}</div>
      </div>
    </div>
  );
}

function DetailSection({ title, fields, monoKeys = [] }: { title: string; fields: Array<[string, string | undefined]>; monoKeys?: string[] }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1 break-all text-sm font-medium ${monoKeys.includes(label) ? "font-mono text-xs" : ""}`}>{value || "—"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</div></div>;
}
