import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import type { ImageProxyHealthCore, ImageProxyHealthEvent, ImageProxyModelHealth } from "@/lib/settings-types";

import {
  formatHealthDateTime,
  formatHealthDuration,
  healthLabel,
  healthTone,
  modelHealthStatusClass,
} from "./image-proxy-health-utils";
import { SettingsNotice } from "./settings-ui";

export function ImageProxyChannelHealthCard({
  title,
  description,
  icon: Icon,
  health,
  configuredHint,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  health: ImageProxyHealthCore;
  configuredHint?: string;
}) {
  const cards = useMemo(
    () => [
      { label: "最近样本", value: String(health.total || 0) },
      { label: "成功率", value: `${health.success_rate || 0}%` },
      { label: "平均耗时", value: formatHealthDuration(health.average_latency_ms) },
      { label: "限流", value: String(health.rate_limited || 0) },
      { label: "超时", value: String(health.timeout || 0) },
      { label: "网关错误", value: String(health.gateway_errors || 0) },
      { label: "HTTP 502", value: String(health.http_502 || 0) },
      { label: "HTTP 524", value: String(health.http_524 || 0) },
    ],
    [health],
  );
  const models: ImageProxyModelHealth[] = health.models || [];
  const recent: ImageProxyHealthEvent[] = health.recent || [];

  return (
    <div className="grid gap-4 rounded-[18px] border border-border/80 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-[#1456f0]" />
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
            {configuredHint ? <div className="mt-0.5 text-xs text-muted-foreground">{configuredHint}</div> : null}
          </div>
        </div>
        <Badge variant={healthTone(health)}>{healthLabel(health)}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {cards.map((item) => (
          <div key={item.label} className="rounded-[14px] border border-border/70 bg-muted/35 px-3 py-3">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-base font-semibold text-foreground">{item.value}</div>
          </div>
        ))}
      </div>

      {health.last_error ? (
        <SettingsNotice>
          最近错误：{health.last_error_code ? `${health.last_error_code}，` : ""}
          {health.last_error}
        </SettingsNotice>
      ) : null}

      {models.length > 0 ? (
        <div className="grid gap-2">
          <div className="text-xs font-medium text-muted-foreground">模型成功率</div>
          {models.slice(0, 4).map((item) => (
            <div
              key={item.model}
              className="grid gap-2 rounded-[14px] border border-border/70 bg-muted/20 px-3 py-2 text-xs md:grid-cols-[minmax(0,1fr)_70px_90px_90px_90px]"
            >
              <span className="min-w-0 truncate font-medium text-foreground" title={item.model}>
                {item.model}
              </span>
              <span>{item.success_rate || 0}%</span>
              <span>成功 {item.success || 0}</span>
              <span>失败 {item.failed || 0}</span>
              <span className={modelHealthStatusClass(item.last_status)}>
                {item.last_status === "success" ? "最近成功" : item.last_status === "failed" ? "最近失败" : "未知"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="text-xs font-medium text-muted-foreground">最近请求</div>
        {recent.slice(0, 5).map((item, index) => (
          <div
            key={`${item.at}-${index}`}
            className="grid gap-2 rounded-[14px] border border-border/70 bg-muted/20 px-3 py-2 text-xs md:grid-cols-[90px_90px_110px_minmax(0,1fr)]"
          >
            <span className={item.success ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
              {item.success ? "成功" : "失败"}
            </span>
            <span>{formatHealthDuration(item.duration_ms)}</span>
            <span>{item.status_code || "-"}</span>
            <span className="min-w-0 truncate text-muted-foreground" title={item.message || item.code || item.model || ""}>
              {item.message || item.code || item.model || "-"}
            </span>
          </div>
        ))}
        {health.total > 0 ? null : (
          <div className="rounded-[14px] border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            暂无该渠道生图记录
          </div>
        )}
        {health.last_success_at || health.last_error_at ? (
          <div className="text-xs text-muted-foreground">
            最近成功：{formatHealthDateTime(health.last_success_at)}，最近失败：{formatHealthDateTime(health.last_error_at)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
