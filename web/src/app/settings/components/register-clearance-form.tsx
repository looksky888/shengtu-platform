"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RegisterClearanceConfig } from "@/lib/api";
import { STORED_SECRET_HINT } from "@/lib/register-types";
import { cn } from "@/lib/utils";

import {
  SettingsSecretInput,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";

export function RegisterClearanceForm({
  clearance,
  mode,
  isRegisterRunning,
  onChange,
}: {
  clearance: RegisterClearanceConfig;
  mode: RegisterClearanceConfig["mode"];
  isRegisterRunning: boolean;
  onChange: (updates: Partial<RegisterClearanceConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <SettingsSwitchRow
        id="register-clearance-enabled"
        title="启用注册机 Cloudflare Clearance 处理"
        description="开启后，自动化注册任务将按下方选定模式携带过盾凭据请求上游接口"
        checked={Boolean(clearance.enabled)}
        disabled={isRegisterRunning}
        onCheckedChange={(checked) => onChange({ enabled: checked })}
      />

      <SettingsSection
        title="清障工作模式与调度周期"
        description="选择 FlareSolverr 自动刷新或手动注入浏览器提取的 Cookie 凭据。"
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label
              htmlFor="register-clearance-mode"
              className="block text-xs font-medium text-foreground sm:text-[13px]"
            >
              清障处理模式
            </label>
            <Select
              value={mode}
              onValueChange={(value) =>
                onChange({ mode: value as RegisterClearanceConfig["mode"] })
              }
              disabled={isRegisterRunning}
            >
              <SelectTrigger
                id="register-clearance-mode"
                className={cn("w-full", settingsInputClassName)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flaresolverr">
                  FlareSolverr 自动刷新（推荐）
                </SelectItem>
                <SelectItem value="manual">
                  手动注入 Cookie 与 User-Agent
                </SelectItem>
                <SelectItem value="none">
                  无清障（直连或仅使用注册代理）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "flaresolverr" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="register-flaresolverr-url"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                FlareSolverr 服务地址
              </label>
              <Input
                id="register-flaresolverr-url"
                className={cn(
                  settingsInputClassName,
                  "font-mono text-xs sm:text-[13px]"
                )}
                value={clearance.flaresolverr_url || ""}
                onChange={(event) =>
                  onChange({ flaresolverr_url: event.target.value })
                }
                placeholder="http://127.0.0.1:8191 或 http://flaresolverr:8191"
                disabled={isRegisterRunning}
              />
            </div>
          ) : null}

          <SettingsUnitInput
            id="register-clearance-timeout"
            label="单次过盾超时"
            unit="秒"
            min={5}
            max={300}
            rangeHint="5–300"
            value={clearance.timeout_seconds || 60}
            disabled={isRegisterRunning}
            onChange={(value) =>
              onChange({ timeout_seconds: Number(value) || 60 })
            }
          />

          <SettingsUnitInput
            id="register-clearance-refresh"
            label="自动续期间隔"
            unit="秒"
            min={0}
            max={86400}
            rangeHint="0 = 不轮询"
            value={clearance.refresh_interval_seconds ?? 3600}
            disabled={isRegisterRunning}
            onChange={(value) =>
              onChange({ refresh_interval_seconds: Number(value) || 0 })
            }
          />

          <div className="space-y-1.5 sm:col-span-2">
            <label
              htmlFor="register-clearance-proxy"
              className="block text-xs font-medium text-foreground sm:text-[13px]"
            >
              注册清障专用代理
            </label>
            <Input
              id="register-clearance-proxy"
              className={cn(
                settingsInputClassName,
                "font-mono text-xs sm:text-[13px]"
              )}
              value={clearance.proxy || ""}
              onChange={(event) => onChange({ proxy: event.target.value })}
              placeholder="留空默认跟随自动化注册代理；填写 direct 表示强制直连"
              disabled={isRegisterRunning}
            />
          </div>
        </div>
      </SettingsSection>

      {mode === "manual" ? (
        <SettingsSection
          title="手动过盾凭据（Cookie & UA）"
          description="请确保 User-Agent、出口代理 IP 与提取 cf_clearance 时的浏览器环境保持一致。"
        >
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="register-manual-ua"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                浏览器 User-Agent
              </label>
              <Input
                id="register-manual-ua"
                className={cn(settingsInputClassName, "font-mono text-xs")}
                value={clearance.user_agent || ""}
                onChange={(event) =>
                  onChange({ user_agent: event.target.value })
                }
                placeholder="Mozilla/5.0 ...（须与签发 cf_clearance 的浏览器完全一致）"
                disabled={isRegisterRunning}
              />
            </div>

            <SettingsSecretInput
              id="register-manual-cf-clearance"
              label="cf_clearance 凭据值"
              value={clearance.cf_clearance || ""}
              onChange={(value) => onChange({ cf_clearance: value })}
              configured={Boolean(clearance.cf_credentials_configured)}
              configuredLabel="凭据已加密保存"
              placeholder={
                clearance.cf_credentials_configured
                  ? STORED_SECRET_HINT
                  : "粘贴浏览器提取的 cf_clearance 值"
              }
              disabled={isRegisterRunning}
              onClear={() => onChange({ cf_clearance: "" })}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="register-manual-cookies"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                附加 Cookie 列表（可选）
              </label>
              <Textarea
                id="register-manual-cookies"
                className={cn(
                  settingsInputClassName,
                  "min-h-24 font-mono text-xs leading-5"
                )}
                value={clearance.cf_cookies || ""}
                onChange={(event) =>
                  onChange({ cf_cookies: event.target.value })
                }
                placeholder={
                  clearance.cf_credentials_configured
                    ? STORED_SECRET_HINT
                    : "__cf_bm=xxx; _cfuvid=yyy"
                }
                disabled={isRegisterRunning}
              />
            </div>
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}
