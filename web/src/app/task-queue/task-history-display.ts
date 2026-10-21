import type { CreationTask } from "@/lib/api";
import { formatDateTime as formatBizDateTime } from "@/lib/datetime";

export function formatTaskDateTime(value?: string | null) {
  return formatBizDateTime(value, { compact: true });
}

export function taskStatusLabel(status: CreationTask["status"]) {
  switch (status) {
    case "queued": return "排队中";
    case "running": return "处理中";
    case "success": return "成功";
    case "error": return "失败";
    case "cancelled": return "已终止";
    default: return status;
  }
}

export function taskStatusVariant(status: CreationTask["status"]) {
  if (status === "success") return "success" as const;
  if (status === "error") return "danger" as const;
  if (status === "running" || status === "queued") return "warning" as const;
  return "secondary" as const;
}

export function taskModeLabel(mode: CreationTask["mode"]) {
  switch (mode) {
    case "generate": return "文生图";
    case "edit": return "图生图";
    case "response-image": return "Responses 生图";
    case "chat": return "文本任务";
    case "video": return "视频任务";
    default: return mode;
  }
}

export function buildTaskTroubleshootingText(item: CreationTask) {
  return [
    `任务 ID：${item.id}`,
    `状态：${taskStatusLabel(item.status)}`,
    `用户：${item.owner_name || item.owner_id || "—"}`,
    `模型：${item.model || "—"}`,
    `生效 provider：${item.effective_provider || "—"}`,
    `生效通道：${item.effective_channel || "—"}`,
    `配置来源：${item.provider_source || "—"}`,
    `上游模型：${item.effective_model || item.model || "—"}`,
    `上游主机：${item.upstream_host || "—"}`,
    `上游 HTTP：${item.upstream_http_status || "—"}`,
    `重试：${typeof item.retry_index === "number" ? item.retry_index : "—"} / ${typeof item.attempt_count === "number" ? item.attempt_count : "—"}`,
    `尺寸：${item.size || "—"}`,
    `错误码：${item.error_code || "—"}`,
    `上游 Request ID：${item.upstream_request_id || "—"}`,
    `CF-Ray：${item.upstream_cf_ray || "—"}`,
    `错误：${item.error || "—"}`,
    `建议：${item.troubleshooting || "—"}`,
    `创建：${item.created_at}`,
    `更新：${item.updated_at}`,
  ].join("\n");
}
