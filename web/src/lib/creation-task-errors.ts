import type { CreationTask } from "@/lib/image-task-types";

export type CreationTaskFailure = {
  title: string;
  detail: string;
  actionLabel: string;
  actionHref?: string;
  retryable: boolean;
};

const retryableCodes = new Set([
  "image_queue_full",
  "video_queue_full",
  "user_concurrency_limited",
  "user_rpm_limited",
  "account_pool_slot_busy",
  "upstream_rate_limited",
  "upstream_connection_interrupted",
  "upstream_timeout",
  "upstream_gateway_error",
  "video_generation_failed",
  "video_result_empty",
  "video_content_empty",
]);

export function creationTaskFailure(task: Pick<CreationTask, "error" | "error_code" | "troubleshooting">): CreationTaskFailure {
  const code = String(task.error_code || "");
  const fallback = task.error || "创作任务失败";
  if (code === "insufficient_credits") return { title: "积分不足", detail: task.troubleshooting || fallback, actionLabel: "前往充值", actionHref: "/recharge", retryable: false };
  if (["account_pool_slot_busy", "grok_account_pool_unavailable", "no_available_image_quota", "no_paid_image_account"].includes(code)) {
    return { title: fallback, detail: task.troubleshooting || "请检查账号状态、额度和可用槽位。", actionLabel: "查看号池", actionHref: "/accounts", retryable: code === "account_pool_slot_busy" };
  }
  if (code === "upstream_safety_rejected") return { title: fallback, detail: task.troubleshooting || "请修改提示词或参考图后再提交。", actionLabel: "修改参数", retryable: false };
  if (code === "upstream_rate_limited") return { title: "上游触发速率限制", detail: task.troubleshooting || fallback, actionLabel: "稍后重试", retryable: true };
  if (code === "upstream_timeout") return { title: "生成任务超时", detail: task.troubleshooting || fallback, actionLabel: "降低参数后重试", retryable: true };
  if (code === "upstream_gateway_error" || code === "upstream_connection_interrupted") return { title: "上游连接不稳定", detail: task.troubleshooting || fallback, actionLabel: "重新提交", retryable: true };
  return { title: fallback, detail: task.troubleshooting || "请复制任务 ID 提交给管理员排查。", actionLabel: retryableCodes.has(code) ? "重新提交" : "复制任务 ID", retryable: retryableCodes.has(code) };
}

export function creationSubmitError(error: unknown): { code: string; message: string } {
  const value = error as { code?: unknown; message?: unknown };
  return { code: typeof value?.code === "string" ? value.code : "", message: typeof value?.message === "string" ? value.message : "提交任务失败" };
}
