export const paymentOrderStatuses = ["created", "pending", "closing", "succeeded", "closed", "failed", "exception"] as const;

export const paymentOrderStatusLabels: Record<string, string> = {
  created: "待生成",
  pending: "待支付",
  closing: "关闭中",
  succeeded: "已完成",
  closed: "已关闭",
  failed: "失败",
  exception: "异常",
};

export function paymentOrderStatusLabel(status: string): string {
  return paymentOrderStatusLabels[status] || "未知状态";
}

export function paymentOrderStatusVariant(status: string): "success" | "danger" | "warning" | "secondary" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "exception") return "danger";
  if (status === "created" || status === "pending" || status === "closing") return "warning";
  return "secondary";
}
