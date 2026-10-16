import type { CreationTask } from "@/lib/api";
import { formatDateTime as formatBizDateTime, parseDateTime } from "@/lib/datetime";

/** Parse task timestamps like "2026-07-11 12:00:00" or RFC3339 (China wall-clock when naive). */
export function taskTimeMs(value?: string | null) {
  const date = parseDateTime(value);
  return date ? date.getTime() : 0;
}

export function sortTasksNewestFirst(list: CreationTask[]) {
  return [...list].sort((a, b) => {
    const tb = taskTimeMs(b.created_at) || taskTimeMs(b.updated_at);
    const ta = taskTimeMs(a.created_at) || taskTimeMs(a.updated_at);
    if (tb !== ta) return tb - ta;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

/** Task list / detail timestamps in 中国时间 (Asia/Shanghai). */
export function formatDateTime(value?: string | null) {
  return formatBizDateTime(value, { withSeconds: true });
}

export function modeLabel(mode: CreationTask["mode"]) {
  switch (mode) {
    case "generate":
      return "文生图";
    case "edit":
      return "图生图";
    case "response-image":
      return "Responses";
    case "chat":
      return "文本任务";
    case "video":
      return "视频生成";
    default:
      return mode;
  }
}

export function statusLabel(status: CreationTask["status"]) {
  switch (status) {
    case "queued":
      return "排队";
    case "running":
      return "运行";
    case "success":
      return "成功";
    case "error":
      return "失败";
    case "cancelled":
      return "取消";
    default:
      return status;
  }
}

export function resolveProgress(item: CreationTask) {
  if (typeof item.progress === "number" && Number.isFinite(item.progress)) {
    return Math.max(0, Math.min(100, Math.round(item.progress)));
  }
  // No fake mid-progress when backend omits progress — only terminal = 100.
  switch (item.status) {
    case "success":
    case "error":
    case "cancelled":
      return 100;
    case "queued":
    case "running":
    default:
      return 0;
  }
}

/** True when progress is unknown and UI should show indeterminate state. */
export function isProgressIndeterminate(item: CreationTask) {
  if (typeof item.progress === "number" && Number.isFinite(item.progress)) {
    return false;
  }
  return item.status === "queued" || item.status === "running";
}

export function resolveStage(item: CreationTask) {
  return (
    item.progress_stage ||
    (
      {
        queued: "排队中",
        running: "正在生成",
        success: "已完成",
        error: "失败",
        cancelled: "已取消",
      } as Record<string, string>
    )[item.status] ||
    "—"
  );
}

export function resolveMessage(item: CreationTask) {
  if (item.status === "error") return item.error || item.progress_message || "任务失败";
  if (item.status === "cancelled") return item.error || item.progress_message || "任务已终止";
  return item.progress_message || (item.status === "success" ? "任务已完成" : "等待执行");
}

export function formatDuration(item: CreationTask) {
  if (typeof item.duration_seconds === "number" && item.duration_seconds > 0) {
    return `${item.duration_seconds.toFixed(1)}s`;
  }
  return "—";
}

const TASK_STAGE_LABELS: Record<string, string> = {
  queue_wait: "排队等待",
  prepare: "准备任务",
  slot_wait: "并发槽位等待",
  account_wait: "账号等待",
  upstream_and_media: "上游生成与媒体归档",
  upstream_prepare: "上游准备",
  result_processing: "结果处理",
  image_download: "图片下载",
};

export function taskStageLabel(stage: string) {
  return TASK_STAGE_LABELS[stage] || stage.replaceAll("_", " ");
}

export function taskStageDurations(item: CreationTask) {
  const values = item.stage_durations_ms;
  if (!values || typeof values !== "object") return [] as Array<{ stage: string; milliseconds: number }>;
  return Object.entries(values)
    .map(([stage, milliseconds]) => ({ stage, milliseconds: Number(milliseconds) }))
    .filter((entry) => Number.isFinite(entry.milliseconds) && entry.milliseconds >= 0)
    .sort((a, b) => b.milliseconds - a.milliseconds);
}

export type TaskStageSection = {
  key: string;
  label: string;
  milliseconds: number;
  rawStages: string[];
};

const TASK_STAGE_SECTIONS: Array<{ key: string; label: string; stages: string[] }> = [
  { key: "entry", label: "入口与排队", stages: ["queue_wait"] },
  { key: "account", label: "账号与上游准备", stages: ["prepare", "slot_wait", "account_wait", "upstream_prepare"] },
  { key: "upstream", label: "上游生成", stages: ["upstream_and_media"] },
  { key: "result", label: "结果处理", stages: ["result_processing"] },
  { key: "download", label: "图片下载", stages: ["image_download"] },
];

export function taskStageSections(item: CreationTask): TaskStageSection[] {
  const durations = new Map(taskStageDurations(item).map((entry) => [entry.stage, entry.milliseconds]));
  return TASK_STAGE_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    rawStages: section.stages.filter((stage) => durations.has(stage)),
    milliseconds: section.stages.reduce((sum, stage) => sum + (durations.get(stage) || 0), 0),
  })).filter((section) => section.rawStages.length > 0 || section.key === "result" || section.key === "download");
}

export function formatStageDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "未记录";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

export function failureAction(item: CreationTask): { label: string; href?: string } | null {
  const code = String(item.error_code || "");
  const msg = String(item.error || item.progress_message || "").toLowerCase();
  if (code === "account_pool_slot_busy" || msg.includes("account slot") || msg.includes("并发槽")) {
    return { label: "号池", href: "/accounts" };
  }
  if (
    code === "no_paid_image_account" ||
    code === "no_available_image_quota" ||
    msg.includes("no available image quota") ||
    msg.includes("没有可用图片额度") ||
    msg.includes("没有可用")
  ) {
    return { label: "号池", href: "/accounts" };
  }
  if (code === "insufficient_credits" || msg.includes("积分")) {
    return { label: "积分", href: "/credits-admin" };
  }
  if (item.status !== "error") return null;
  return { label: "复制" };
}

export function buildTroubleshoot(item: CreationTask) {
  const events = Array.isArray(item.events)
    ? item.events.map((e) => `${e.time || ""} [${e.stage || ""}] ${e.message || ""}`).join("\n")
    : "";
  return [
    `任务 ID：${item.id}`,
    `状态：${statusLabel(item.status)}`,
    `用户：${item.owner_name || item.owner_id || "—"}`,
    `模型：${item.model || "—"}`,
    `生效 provider：${item.effective_provider || "—"}`,
    `生效通道：${item.effective_channel || "—"}`,
    `配置来源：${item.provider_source || "—"}`,
    `上游模型：${item.effective_model || item.model || "—"}`,
    `账号：${item.account_label || "—"}`,
    `账号指纹：${item.account_token_hash || "—"}`,
    `上游主机：${item.upstream_host || "—"}`,
    `上游 HTTP：${item.upstream_http_status || "—"}`,
    `重试：${typeof item.retry_index === "number" ? item.retry_index : "—"} / ${typeof item.attempt_count === "number" ? item.attempt_count : "—"}`,
    `错误码：${item.error_code || "—"}`,
    `Request ID：${item.upstream_request_id || "—"}`,
    `CF-Ray：${item.upstream_cf_ray || "—"}`,
    `错误：${item.error || "—"}`,
    `建议：${item.troubleshooting || "—"}`,
    `阶段耗时：${taskStageDurations(item).map((entry) => `${taskStageLabel(entry.stage)} ${formatStageDuration(entry.milliseconds)}`).join("，") || "未记录"}`,
    `事件：\n${events || "—"}`,
  ].join("\n");
}
