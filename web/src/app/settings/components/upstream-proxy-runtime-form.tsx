"use client";

import { Cookie, Flame, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ClearanceTestResult,
  ProxyTestResult,
  SettingsConfig,
} from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  SettingsNotice,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";

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
    <div className="space-y-4">
      <SettingsSection
        title="全局出站代理"
        description="作用于本地号池生图、视频生成与账号巡检请求（支持 HTTP / HTTPS / SOCKS5H）。"
      >
        <div className="space-y-2">
          <label
            htmlFor="upstream-proxy-url"
            className="block text-xs font-medium text-foreground sm:text-[13px]"
          >
            代理服务地址
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="upstream-proxy-url"
              className={cn(
                settingsInputClassName,
                "min-w-0 flex-1 font-mono text-xs sm:text-[13px]"
              )}
              value={String(config.proxy || "")}
              onChange={(event) => onProxyChange(event.target.value)}
              placeholder="http://privoxy:8118 或 socks5h://127.0.0.1:1080"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isTestingProxy}
              onClick={onTestProxy}
              className="h-9 shrink-0 gap-1.5 px-3 text-xs"
            >
              <ShieldCheck className="size-3.5" />
              <span>测试代理连通</span>
            </Button>
          </div>
          {proxyResult ? (
            <SettingsNotice tone={proxyResult.ok ? "success" : "danger"}>
              {proxyResult.ok
                ? `代理连通正常：HTTP ${proxyResult.status} · 延迟 ${proxyResult.latency_ms} ms`
                : `代理连通失败：${proxyResult.error ?? "未知错误"}（耗时 ${proxyResult.latency_ms} ms）`}
            </SettingsNotice>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="生图上游 Cloudflare 清障"
        description="遭遇 Cloudflare 403 盾挑战时自动获取并续期 cf_clearance Cookie 凭据。"
      >
        <div className="space-y-3">
          <SettingsSwitchRow
            id="upstream-clearance-enabled"
            title="启用生图上游 Clearance 自动过盾"
            description="开启后由 FlareSolverr 容器配合同一出口代理自动维护过盾会话"
            checked={enabled}
            onCheckedChange={(checked) =>
              onFieldChange({ upstream_clearance_enabled: checked })
            }
          />

          <SettingsSwitchRow
            id="upstream-clearance-warmup"
            title="保存或启动后自动后台预热"
            description="配置变更保存或服务重启后立即异步预热一次 Clearance 缓存，降低首单延迟"
            checked={warmUp}
            disabled={!enabled}
            onCheckedChange={(checked) =>
              onFieldChange({ upstream_clearance_warm_up_on_start: checked })
            }
          />

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="upstream-clearance-mode"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                清障工作模式
              </label>
              <Select
                value={mode}
                onValueChange={(value) =>
                  onFieldChange({ upstream_clearance_mode: value })
                }
                disabled={!enabled}
              >
                <SelectTrigger
                  id="upstream-clearance-mode"
                  className={cn("w-full", settingsInputClassName)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flaresolverr">
                    FlareSolverr 自动过盾（推荐）
                  </SelectItem>
                  <SelectItem value="manual">
                    手动凭据模式（仅使用已有缓存，不自动拉起浏览器）
                  </SelectItem>
                  <SelectItem value="none">
                    无清障（仅直连或代理转发）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "flaresolverr" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="upstream-flaresolverr-url"
                  className="block text-xs font-medium text-foreground sm:text-[13px]"
                >
                  FlareSolverr 服务地址
                </label>
                <Input
                  id="upstream-flaresolverr-url"
                  className={cn(
                    settingsInputClassName,
                    "font-mono text-xs sm:text-[13px]"
                  )}
                  value={String(config.flaresolverr_url || "")}
                  onChange={(event) =>
                    onFieldChange({ flaresolverr_url: event.target.value })
                  }
                  placeholder="http://flaresolverr:8191"
                  disabled={!enabled}
                />
              </div>
            ) : null}

            <SettingsUnitInput
              id="upstream-clearance-timeout"
              label="过盾请求超时"
              unit="秒"
              min={10}
              max={300}
              rangeHint="10–300"
              value={config.upstream_clearance_timeout_sec ?? 60}
              disabled={!enabled}
              onChange={(value) =>
                onFieldChange({
                  upstream_clearance_timeout_sec: Number(value) || 60,
                })
              }
            />

            <SettingsUnitInput
              id="upstream-clearance-refresh"
              label="缓存续期间隔"
              unit="秒"
              min={60}
              max={86400}
              rangeHint="60–86400"
              value={config.upstream_clearance_refresh_interval ?? 3600}
              disabled={!enabled}
              onChange={(value) =>
                onFieldChange({
                  upstream_clearance_refresh_interval: Number(value) || 3600,
                })
              }
            />

            <SettingsUnitInput
              id="upstream-challenge-cooldown"
              label="触发 CF 盾后单账号冷却"
              unit="秒"
              min={60}
              max={7200}
              rangeHint="60–7200"
              description="默认 900 秒（15 分钟）；设置过长可能在集中触发盾挑战时导致整个号池短暂无可用账号。"
              value={config.image_challenge_cooldown_seconds ?? 900}
              onChange={(value) =>
                onFieldChange({
                  image_challenge_cooldown_seconds: Number(value) || 900,
                })
              }
              className="sm:col-span-2"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Clearance 在线验证与立即预热"
        description="模拟访问目标上游站点以验证 FlareSolverr 是否能成功获取 Cookie 与 User-Agent。"
      >
        <div className="space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              className={cn(
                settingsInputClassName,
                "min-w-0 flex-1 font-mono text-xs sm:text-[13px]"
              )}
              value={targetUrl}
              onChange={(event) => onTargetUrlChange(event.target.value)}
              placeholder="https://chatgpt.com"
              disabled={!enabled || mode !== "flaresolverr"}
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isTestingClearance}
                onClick={onTestClearance}
                disabled={isWarming || !enabled || mode !== "flaresolverr"}
                className="h-9 gap-1.5 px-3 text-xs"
              >
                <Cookie className="size-3.5" />
                <span>测试过盾</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isWarming}
                onClick={onWarmUp}
                disabled={
                  isTestingClearance || !enabled || mode !== "flaresolverr"
                }
                className="h-9 gap-1.5 px-3 text-xs"
              >
                <Flame className="size-3.5" />
                <span>立即预热</span>
              </Button>
            </div>
          </div>

          {clearanceResult ? (
            <SettingsNotice tone={clearanceResult.ok ? "success" : "danger"}>
              {clearanceResult.ok
                ? `Clearance 验证通过 · 耗时 ${clearanceResult.latency_ms} ms · 获取 ${clearanceResult.cookie_count ?? 0} 枚 Cookie${clearanceResult.has_user_agent ? " · 已同步浏览器 UA" : ""}`
                : `Clearance 验证失败：${clearanceResult.error ?? clearanceResult.status ?? "未知错误"}`}
            </SettingsNotice>
          ) : null}
        </div>
      </SettingsSection>
    </div>
  );
}
