"use client";

import type { ProxyRuntimeStatus, SettingsConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

import { SettingsNotice, settingsInlineCodeClassName } from "./settings-ui";

function modeDisplayLabel(mode: string, enabled: boolean): string {
  if (!enabled || mode === "none") return "无清障 / 直连";
  if (mode === "flaresolverr") return "FlareSolverr 自动过盾";
  if (mode === "manual") return "手动凭据复用";
  return mode;
}

export function UpstreamProxyRuntimeStatus({
  config,
  runtimeStatus,
}: {
  config: SettingsConfig;
  runtimeStatus: ProxyRuntimeStatus | null;
}) {
  const enabled = Boolean(config.upstream_clearance_enabled);
  const mode = String(config.upstream_clearance_mode || "none");
  const proxyValue = String(config.proxy || "").trim();
  const proxyFilled = Boolean(proxyValue);
  const flareFilled = Boolean(String(config.flaresolverr_url || "").trim());
  const cachedHosts = runtimeStatus?.cached_clearance_hosts || [];
  const hasBundle = Boolean(runtimeStatus?.has_clearance_bundle);

  const summary = [
    {
      label: "出站代理链路",
      value: proxyFilled ? "已配置代理" : "未配置（直连）",
      sub: proxyFilled ? proxyValue : "宿主机网络直接出站",
      tone: proxyFilled ? ("success" as const) : ("neutral" as const),
    },
    {
      label: "上游清障模式",
      value: modeDisplayLabel(mode, enabled),
      sub:
        enabled && mode === "flaresolverr"
          ? flareFilled
            ? "FlareSolverr 地址已就绪"
            : "待填写 FlareSolverr 地址"
          : "未开启自动过盾刷新",
      tone:
        enabled && mode === "flaresolverr" && !flareFilled
          ? ("warning" as const)
          : enabled && mode !== "none"
            ? ("success" as const)
            : ("neutral" as const),
    },
    {
      label: "Clearance 缓存",
      value: hasBundle
        ? `有效 (${runtimeStatus?.cookie_count ?? 0} 枚 Cookie)`
        : cachedHosts.length > 0
          ? "缓存已过期"
          : "暂无缓存",
      sub: cachedHosts.length > 0 ? cachedHosts.join(", ") : "测试或预热后生成",
      tone: hasBundle
        ? ("success" as const)
        : cachedHosts.length > 0
          ? ("warning" as const)
          : ("neutral" as const),
    },
    {
      label: "盾后账号冷却",
      value: `${config.image_challenge_cooldown_seconds ?? 900} 秒`,
      sub: "触发 403 盾挑战后单号隔离时长",
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {summary.map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-xl border border-border/75 bg-surface-subtle/50 p-3"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  item.tone === "success" && "bg-status-success",
                  item.tone === "warning" && "bg-status-warning",
                  item.tone === "neutral" && "bg-muted-foreground/55"
                )}
              />
              <span>{item.label}</span>
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {item.value}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {cachedHosts.length > 0 &&
      (runtimeStatus?.bundle_created_at || runtimeStatus?.bundle_expires_at) ? (
        <div className="rounded-xl border border-border/70 bg-surface-subtle/40 px-3.5 py-2 text-[11px] leading-5 text-muted-foreground">
          <span>缓存主机：</span>
          <code className={settingsInlineCodeClassName}>
            {cachedHosts.join(" / ")}
          </code>
          {runtimeStatus?.bundle_created_at
            ? ` · 创建于 ${runtimeStatus.bundle_created_at}`
            : ""}
          {runtimeStatus?.bundle_expires_at
            ? ` · 过期于 ${runtimeStatus.bundle_expires_at}`
            : ""}
        </div>
      ) : null}

      <SettingsNotice tone="warning">
        启用 WARP 容器栈前请先执行{" "}
        <code className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          docker compose -f docker-compose.warp.yml up -d
        </code>
        ，并将上游代理设为{" "}
        <code className="rounded bg-surface/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          http://privoxy:8118
        </code>
        。若仅开启 FlareSolverr 而不挂载一致出口代理，Cloudflare 仍会因出口 IP 不匹配而拦截请求。
      </SettingsNotice>
    </div>
  );
}
