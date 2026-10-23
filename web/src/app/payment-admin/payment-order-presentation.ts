import type { PaymentChannel } from "@/lib/payment-admin-api";
export { paymentOrderStatuses, paymentOrderStatusLabels, paymentOrderStatusVariant } from "@/lib/payment-order-status";

const TERMINAL_NON_QUERYABLE_ORDER_STATUSES = new Set([
  "succeeded",
  "closed",
  "refunded",
  "expired",
]);

export function canQueryPaymentOrder(status: string): boolean {
  return !TERMINAL_NON_QUERYABLE_ORDER_STATUSES.has(status);
}

export function paymentChannelName(channelID: string, channels: PaymentChannel[]): string {
  const channel = channels.find((item) => item.id === channelID);
  if (!channel) return channelID || "未知渠道";
  return channel.provider === "alipay" ? "支付宝" : channel.provider === "wechatpay" ? "微信支付" : channel.name;
}

export function paymentChannelDotClass(channelID: string, channels: PaymentChannel[]): string {
  return channels.find((item) => item.id === channelID)?.provider === "alipay" ? "bg-foreground" : "bg-status-success";
}

export function formatPaymentAmount(amountFen: number): string {
  return `¥${(amountFen / 100).toFixed(2)}`;
}

export function shortPaymentOrderID(id: string): string {
  const compact = id.replaceAll("-", "");
  return compact ? `#${compact.slice(0, 8).toUpperCase()}` : "—";
}
