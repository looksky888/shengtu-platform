import type { CheckoutTask } from "@/lib/register-types";

const STAGE_LABELS: Record<string, string> = {
  account_saved: "账号已保存",
  checkout: "创建 Checkout",
  checkout_created: "创建 Checkout",
  checkout_update: "更新 Checkout",
  promotion: "更新优惠",
  stripe: "初始化 Stripe",
  stripe_init: "初始化 Stripe",
  stripe_bootstrap: "IN Bootstrap 检查",
  stripe_provider: "IN Provider 复核",
  stripe_elements: "创建 Elements 会话",
  stripe_token: "加载 Stripe 配置",
  billing: "提交 Billing",
  payment_method: "创建支付方式",
  confirm: "确认支付",
  confirm_retry: "二次确认支付",
  approve: "等待授权",
  approved: "授权完成",
  poll: "轮询结果链接",
  extracting: "提取最终链接",
  extract: "提取最终链接",
  final_validate: "校验最终链接",
  queued: "排队",
  running: "提链中",
  retrying: "重试等待",
  completed: "提链完成",
  complete: "提链完成",
  success: "提链完成",
  cancelled: "已停止",
  canceled: "已停止",
  failed: "提链失败",
};

type StatusTone = "success" | "danger" | "secondary" | "warning" | "default" | "info";

function normalized(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function safePaymentLink(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function paymentLinkText(value: unknown) {
  const link = safePaymentLink(value);
  if (!link) return "";
  try {
    const url = new URL(link);
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "") || url.hostname;
  } catch {
    return link;
  }
}

function taskStatus(task: CheckoutTask) {
  return normalized(task.status || task.stage);
}

function statusMeta(task: CheckoutTask): { text: string; tone: StatusTone } {
  const status = taskStatus(task);
  const attempt = Number(task.attempt);
  const attemptText = Number.isFinite(attempt) && attempt > 0 ? `（第 ${Math.floor(attempt)} 轮）` : "";
  if (safePaymentLink(task.payment_link) || ["success", "succeeded", "completed", "complete", "done"].includes(status)) {
    return { text: "提链完成", tone: "success" };
  }
  if (["cancelled", "canceled", "stopped"].includes(status)) return { text: "已停止", tone: "secondary" };
  if (["failed", "error"].includes(status)) return { text: "提链失败", tone: "danger" };
  if (["retrying", "retry_waiting", "retry_wait", "retry"].includes(status)) return { text: "重试等待", tone: "warning" };
  if (["waiting", "queued", "pending"].includes(status)) return { text: "排队", tone: "warning" };
  if (["running", "processing", "extracting", "started"].includes(status)) {
    return { text: `提链中${attemptText}`, tone: "info" };
  }
  return { text: attemptText ? `提链中${attemptText}` : "排队", tone: "secondary" };
}

function stageText(task: CheckoutTask) {
  const stage = normalized(task.stage);
  if (!stage || stage === taskStatus(task)) return "";
  return STAGE_LABELS[stage] || String(task.stage || "").trim();
}

function channelText(task: CheckoutTask) {
  const channel = normalized(task.channel);
  if (channel === "pix") return "Pix";
  if (channel === "upi") return "UPI";
  return "";
}

function updatedAtText(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function errorText(task: CheckoutTask) {
  const raw = String(task.error_short || "").replace(/\s+/g, " ").trim();
  if (!raw || /^第\s*\d+\s*轮提链中$/.test(raw)) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("stripe") && (lower.includes("poll") || lower.includes("轮询")) && (lower.includes("timeout") || lower.includes("timed out"))) return "Stripe 轮询超时";
  if (lower.includes("proxy") || lower.includes("connect aborted")) return "代理连接失败";
  if (lower.includes("timeout") || lower.includes("timed out")) return "请求超时";
  if (lower.includes("rate limit") || lower.includes("429")) return "上游限流";
  if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("403")) return "上游拒绝访问";
  if (lower.includes("final") && lower.includes("link")) return "未取得最终支付链接";
  if (/https?:\/\//i.test(raw) || /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(raw)) return "提链请求失败，请稍后重试";
  return raw.length > 42 ? `${raw.slice(0, 41)}...` : raw;
}

export function getCheckoutTaskPresentation(task: CheckoutTask) {
  const status = taskStatus(task);
  const link = safePaymentLink(task.payment_link);
  const retryAt = ["retrying", "retry_waiting", "retry_wait", "retry"].includes(status) && task.next_retry_at
    ? `下次重试 ${updatedAtText(task.next_retry_at)}`
    : "";
  return {
    status: statusMeta(task),
    link,
    linkText: paymentLinkText(link),
    stage: stageText(task),
    detail: String(task.progress_detail || "").replace(/\s+/g, " ").trim(),
    channel: channelText(task),
    error: errorText(task),
    retryAt,
    updatedAt: task.updated_at ? updatedAtText(task.updated_at) : "",
  };
}
