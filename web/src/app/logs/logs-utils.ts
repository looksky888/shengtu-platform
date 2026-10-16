import type { SystemLog, SystemLogFilters } from "@/lib/api";

export const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export const statusOptions = ["200", "201", "400", "401", "403", "404", "422", "429", "500", "502"];
export const logLevelOptions = ["info", "warning", "error"];

export const emptyFilters: SystemLogFilters = {
  username: "",
  module: "",
  summary: "",
  method: "all",
  status: "all",
  ip_address: "",
  operation_type: "",
  log_level: "all",
  start_date: "",
  end_date: "",
};

const detailLabels: Record<string, string> = {
  endpoint: "接口",
  model: "模型",
  method: "方法",
  path: "路径",
  module: "模块",
  status: "状态",
  outcome: "结果",
  log_level: "日志级别",
  operation_type: "操作类型",
  duration_ms: "耗时",
  response_time: "响应时间",
  started_at: "开始时间",
  ended_at: "结束时间",
  username: "操作人",
  key_name: "令牌名称",
  key_role: "角色",
  key_id: "凭据 ID",
  subject_id: "用户 ID",
  provider: "来源",
  ip_address: "IP 地址",
  user_agent: "User-Agent",
  error: "错误",
  token: "令牌",
  source: "来源事件",
  added: "新增",
  skipped: "跳过",
  removed: "删除",
};

const primaryDetailKeys = [
  "method",
  "path",
  "endpoint",
  "module",
  "operation_type",
  "status",
  "outcome",
  "log_level",
  "duration_ms",
  "username",
  "key_name",
  "subject_id",
  "key_id",
  "ip_address",
  "started_at",
  "ended_at",
];

export function primitiveText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function detailValue(item: SystemLog | null, key: string) {
  return item?.detail?.[key];
}

export function detailText(item: SystemLog | null, key: string) {
  return primitiveText(detailValue(item, key));
}

export function actorText(item: SystemLog | null) {
  return detailText(item, "username") || detailText(item, "key_name") || detailText(item, "subject_id") || detailText(item, "key_id") || "-";
}

export function moduleText(item: SystemLog | null) {
  return detailText(item, "module") || "系统日志";
}

export function pathText(item: SystemLog | null) {
  return detailText(item, "path") || detailText(item, "endpoint") || "-";
}

export function logLevel(item: SystemLog | null) {
  const explicit = detailText(item, "log_level");
  if (explicit) return explicit;
  return detailValue(item, "status") === "failed" ? "warning" : "info";
}

export function statusText(item: SystemLog | null) {
  const status = detailValue(item, "status");
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  if (typeof status === "string" || typeof status === "number") return String(status);
  const outcome = detailValue(item, "outcome");
  if (outcome === "success") return "成功";
  if (outcome === "failed") return "失败";
  return "-";
}

export function formatDuration(item: SystemLog | null) {
  const value = detailValue(item, "duration_ms") ?? detailValue(item, "response_time");
  return typeof value === "number" ? `${(value / 1000).toFixed(2)} s` : "-";
}

export function statusBadgeVariant(item: SystemLog | null) {
  const status = detailValue(item, "status");
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  const numeric = typeof status === "number" ? status : Number(status);
  if (Number.isFinite(numeric)) {
    if (numeric >= 500) return "danger";
    if (numeric >= 400) return "warning";
    return "success";
  }
  const outcome = detailValue(item, "outcome");
  if (outcome === "success") return "success";
  if (outcome === "failed") return "danger";
  return "secondary";
}

export function levelBadgeVariant(level: string) {
  if (level === "error") return "danger";
  if (level === "warning") return "warning";
  return "secondary";
}

export function methodBadgeVariant(method: string) {
  if (method === "POST") return "default";
  if (method === "DELETE") return "danger";
  if (method === "PATCH" || method === "PUT") return "warning";
  return "secondary";
}

export function getUrls(item: SystemLog | null) {
  const urls = item?.detail?.urls;
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

export function detailLabel(key: string) {
  return detailLabels[key] || key;
}

export function isPrimitiveDetail(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function formatDetailValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if ((key === "duration_ms" || key === "response_time") && typeof value === "number") return `${(value / 1000).toFixed(2)} s`;
  if (key === "status" || key === "outcome") {
    if (value === "success") return "成功";
    if (value === "failed") return "失败";
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

export function getPrimaryDetailEntries(item: SystemLog | null) {
  const detail = item?.detail || {};
  return primaryDetailKeys
    .filter((key) => key in detail && isPrimitiveDetail(detail[key]))
    .map((key) => [key, detail[key]] as const);
}

export function getExtraDetailEntries(item: SystemLog | null) {
  const detail = item?.detail || {};
  const skipped = new Set([...primaryDetailKeys, "urls", "error"]);
  return Object.entries(detail).filter(([key, value]) => !skipped.has(key) && isPrimitiveDetail(value));
}

export function detailJSON(item: SystemLog | null) {
  return JSON.stringify(item?.detail || {}, null, 2);
}

export function normalizeFilters(filters: SystemLogFilters): SystemLogFilters {
  return {
    username: filters.username?.trim() || "",
    module: filters.module?.trim() || "",
    summary: filters.summary?.trim() || "",
    method: filters.method || "all",
    status: filters.status || "all",
    ip_address: filters.ip_address?.trim() || "",
    operation_type: filters.operation_type?.trim() || "",
    log_level: filters.log_level || "all",
    start_date: filters.start_date || "",
    end_date: filters.end_date || "",
  };
}
