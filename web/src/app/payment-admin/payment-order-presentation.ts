import type { PaymentChannel } from "@/lib/payment-admin-api";
export { paymentOrderStatuses, paymentOrderStatusLabels, paymentOrderStatusVariant } from "@/lib/payment-order-status";

export function paymentChannelName(channelID: string, channels: PaymentChannel[]): string {
  const channel = channels.find((item) => item.id === channelID);
  if (!channel) return channelID || "未知渠道";
  return channel.provider === "alipay" ? "支付宝" : channel.provider === "wechatpay" ? "微信支付" : channel.name;
}

export function paymentChannelDotClass(channelID: string, channels: PaymentChannel[]): string {
  return channels.find((item) => item.id === channelID)?.provider === "alipay" ? "bg-sky-500" : "bg-emerald-500";
}

export function formatPaymentAmount(amountFen: number): string {
  return `¥${(amountFen / 100).toFixed(2)}`;
}

export function shortPaymentOrderID(id: string): string {
  const compact = id.replaceAll("-", "");
  return compact ? `#${compact.slice(0, 8).toUpperCase()}` : "—";
}
