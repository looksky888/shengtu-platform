import { AlertTriangle } from "lucide-react";

import type { ProxyRuntimeStatus, SettingsConfig } from "@/lib/api";

import { SettingsNotice } from "./settings-ui";

export function UpstreamProxyRuntimeStatus({
  config,
  runtimeStatus,
}: {
  config: SettingsConfig;
  runtimeStatus: ProxyRuntimeStatus | null;
}) {
  const enabled = Boolean(config.upstream_clearance_enabled);
  const mode = config.upstream_clearance_mode || "none";
  const proxyFilled = Boolean(String(config.proxy || "").trim());
  const flareFilled = Boolean(String(config.flaresolverr_url || "").trim());
  const cachedHosts = runtimeStatus?.cached_clearance_hosts || [];
  const summary = [
    { label: "出站代理", value: proxyFilled ? "已配置" : "未配置", ok: proxyFilled },
    { label: "上游清障", value: enabled ? mode : "关闭", ok: enabled && mode !== "none" },
    {
      label: "FlareSolverr",
      value: flareFilled ? "已配置" : "未填",
      ok: !enabled || mode !== "flaresolverr" || flareFilled,
    },
    {
      label: "缓存",
      value: runtimeStatus?.has_clearance_bundle
        ? `有效 · ${runtimeStatus.cookie_count ?? "?"} cookie`
        : cachedHosts.length
          ? "已过期"
          : "空",
      ok: Boolean(runtimeStatus?.has_clearance_bundle),
    },
    { label: "冷却", value: `${config.image_challenge_cooldown_seconds ?? 900}s`, ok: true },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {summary.map((item) => (
          <div key={item.label} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className={`mt-1 truncate text-sm font-semibold ${item.ok ? "text-emerald-600" : "text-amber-600"}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {cachedHosts.length ? (
        <p className="break-all text-xs text-muted-foreground">
          已缓存主机：{cachedHosts.join(" / ")}
          {runtimeStatus?.bundle_created_at ? ` · 创建于 ${runtimeStatus.bundle_created_at}` : ""}
          {runtimeStatus?.bundle_expires_at ? ` · 过期 ${runtimeStatus.bundle_expires_at}` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">当前无 clearance 缓存。测试或预热后会在此显示。</p>
      )}

      <SettingsNotice>
        代理优先级：全局代理（本页）作用于号池上游。WARP 栈请填 <code className="rounded bg-muted px-1">http://privoxy:8118</code>
        （容器内）或宿主机映射端口。Cookie 明文不会在测试接口中返回。
      </SettingsNotice>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          使用 WARP 前请 <code className="rounded bg-white/80 px-1 dark:bg-black/20">docker compose -f docker-compose.warp.yml up -d</code>
          。仅开 FlareSolverr、不挂代理，往往仍会被 Cloudflare 拦截。注册 Clearance 与本卡分离：注册走「FlareSolverr / Cloudflare Clearance」卡片。
        </span>
      </div>
    </>
  );
}
