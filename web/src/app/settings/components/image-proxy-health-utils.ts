import { formatDateTime as formatBizDateTime } from "@/lib/datetime";
import type { ImageProxyHealthCore } from "@/lib/settings-types";

type HealthTone = "success" | "warning" | "danger" | "secondary";

export function healthTone(health: ImageProxyHealthCore | null | undefined): HealthTone {
  if (!health || health.total === 0) return "secondary";
  if (health.last_status === "failed") return "danger";
  if (health.success_rate < 60 || health.timeout > 0 || health.rate_limited > 0) return "warning";
  if ((health.http_502 || 0) > 0 || (health.http_524 || 0) > 0) return "warning";
  return "success";
}

export function healthLabel(health: ImageProxyHealthCore | null | undefined) {
  if (!health || health.total === 0) return "暂无样本";
  if (health.last_status === "failed") return "最近失败";
  if (health.success_rate < 60) return "成功率偏低";
  if (health.timeout > 0) return "存在超时";
  if (health.rate_limited > 0) return "存在限流";
  if ((health.http_524 || 0) > 0) return "存在 524";
  if ((health.http_502 || 0) > 0) return "存在 502";
  return "运行正常";
}

export function formatHealthDateTime(value?: string) {
  if (!value) return "-";
  const text = formatBizDateTime(value, { withSeconds: false });
  return text === "—" ? value : text;
}

export function formatHealthDuration(value?: number) {
  if (!value || value <= 0) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

export function modelHealthStatusClass(status?: string) {
  if (status === "success") return "text-emerald-700";
  if (status === "failed") return "text-rose-700";
  return "text-muted-foreground";
}

export function createEmptyImageProxyHealth(): ImageProxyHealthCore {
  return {
    total: 0,
    success: 0,
    failed: 0,
    success_rate: 0,
    rate_limited: 0,
    timeout: 0,
    gateway_errors: 0,
    http_502: 0,
    http_524: 0,
    average_latency_ms: 0,
    recent: [],
    last_status: "unknown",
  };
}
