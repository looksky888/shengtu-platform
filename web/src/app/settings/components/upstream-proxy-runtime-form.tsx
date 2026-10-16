import { Cookie, Flame, LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClearanceTestResult, ProxyTestResult, SettingsConfig } from "@/lib/api";

import { SettingsNotice, settingsInputClassName, settingsToggleClassName } from "./settings-ui";

export type UpstreamClearanceMode = "none" | "flaresolverr" | "manual";

type UpstreamProxyRuntimeFormProps = {
  config: SettingsConfig;
  enabled: boolean;
  mode: UpstreamClearanceMode;
  warmUp: boolean;
  targetUrl: string;
  isTestingProxy: boolean;
  isTestingClearance: boolean;
  isWarming: boolean;
  proxyResult: ProxyTestResult | null;
  clearanceResult: ClearanceTestResult | null;
  onProxyChange: (value: string) => void;
  onFieldChange: (updates: Partial<SettingsConfig>) => void;
  onTargetUrlChange: (value: string) => void;
  onTestProxy: () => void;
  onTestClearance: () => void;
  onWarmUp: () => void;
};

export function UpstreamProxyRuntimeForm(props: UpstreamProxyRuntimeFormProps) {
  const {
    config,
    enabled,
    mode,
    warmUp,
    targetUrl,
    isTestingProxy,
    isTestingClearance,
    isWarming,
    proxyResult,
    clearanceResult,
    onProxyChange,
    onFieldChange,
    onTargetUrlChange,
    onTestProxy,
    onTestClearance,
    onWarmUp,
  } = props;

  return (
    <>
      <label className={settingsToggleClassName}>
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => onFieldChange({ upstream_clearance_enabled: Boolean(checked) })}
        />
        启用生图上游 Clearance（FlareSolverr）
      </label>

      <label className={settingsToggleClassName}>
        <Checkbox
          checked={warmUp}
          onCheckedChange={(checked) => onFieldChange({ upstream_clearance_warm_up_on_start: Boolean(checked) })}
          disabled={!enabled}
        />
        保存配置后自动预热 clearance
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">上游代理 URL</label>
          <Input
            className={settingsInputClassName}
            value={String(config.proxy || "")}
            onChange={(event) => onProxyChange(event.target.value)}
            placeholder="http://privoxy:8118 或 socks5h://host:port"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Clearance 模式</label>
          <Select value={mode} onValueChange={(value) => onFieldChange({ upstream_clearance_mode: value })} disabled={!enabled}>
            <SelectTrigger className={settingsInputClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flaresolverr">FlareSolverr 自动</SelectItem>
              <SelectItem value="none">关闭</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">FlareSolverr URL</label>
          <Input
            className={settingsInputClassName}
            value={String(config.flaresolverr_url || "")}
            onChange={(event) => onFieldChange({ flaresolverr_url: event.target.value })}
            placeholder="http://flaresolverr:8191"
            disabled={!enabled || mode !== "flaresolverr"}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Clearance 超时（秒）</label>
          <Input
            className={settingsInputClassName}
            value={String(config.upstream_clearance_timeout_sec ?? 60)}
            onChange={(event) => onFieldChange({ upstream_clearance_timeout_sec: Number(event.target.value) || 60 })}
            disabled={!enabled}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Clearance 缓存刷新（秒）</label>
          <Input
            className={settingsInputClassName}
            value={String(config.upstream_clearance_refresh_interval ?? 3600)}
            onChange={(event) => onFieldChange({ upstream_clearance_refresh_interval: Number(event.target.value) || 3600 })}
            disabled={!enabled}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">CF 后账号冷却（秒）</label>
          <Input
            className={settingsInputClassName}
            value={String(config.image_challenge_cooldown_seconds ?? 900)}
            onChange={(event) => onFieldChange({ image_challenge_cooldown_seconds: Number(event.target.value) || 900 })}
          />
          <p className="text-xs text-muted-foreground">默认 900（15 分钟）。过长会在一波 CF 后假死整个号池。</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Clearance 测试目标</label>
          <Input
            className={settingsInputClassName}
            value={targetUrl}
            onChange={(event) => onTargetUrlChange(event.target.value)}
            placeholder="https://chatgpt.com"
            disabled={!enabled}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="rounded-xl" onClick={onTestProxy} disabled={isTestingProxy}>
          {isTestingProxy ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          测试代理
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={onTestClearance}
          disabled={isTestingClearance || !enabled || mode !== "flaresolverr"}
        >
          {isTestingClearance ? <LoaderCircle className="size-4 animate-spin" /> : <Cookie className="size-4" />}
          测试 Clearance
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={onWarmUp}
          disabled={isWarming || !enabled || mode !== "flaresolverr"}
        >
          {isWarming ? <LoaderCircle className="size-4 animate-spin" /> : <Flame className="size-4" />}
          立即预热
        </Button>
      </div>

      {proxyResult ? (
        <SettingsNotice className={proxyResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}>
          代理：{proxyResult.ok ? `OK HTTP ${proxyResult.status} · ${proxyResult.latency_ms} ms` : proxyResult.error ?? "失败"}
        </SettingsNotice>
      ) : null}
      {clearanceResult ? (
        <SettingsNotice
          className={clearanceResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}
        >
          Clearance：
          {clearanceResult.ok
            ? `OK · ${clearanceResult.latency_ms} ms · cookies ${clearanceResult.cookie_count ?? 0}${clearanceResult.has_user_agent ? " · 含 UA" : ""}`
            : clearanceResult.error ?? clearanceResult.status}
        </SettingsNotice>
      ) : null}
    </>
  );
}
