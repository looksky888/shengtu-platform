import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RegisterClearanceConfig } from "@/lib/api";
import { STORED_SECRET_HINT } from "@/lib/register-types";

import { settingsInputClassName, settingsToggleClassName } from "./settings-ui";

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
    <>
      <label className={settingsToggleClassName}>
        <Checkbox
          checked={Boolean(clearance.enabled)}
          onCheckedChange={(checked) => onChange({ enabled: Boolean(checked) })}
          disabled={isRegisterRunning}
        />
        启用 Cloudflare Clearance 处理（注册任务）
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">处理模式</label>
          <Select
            value={mode}
            onValueChange={(value) => onChange({ mode: value as RegisterClearanceConfig["mode"] })}
            disabled={isRegisterRunning}
          >
            <SelectTrigger className={settingsInputClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flaresolverr">FlareSolverr 自动刷新</SelectItem>
              <SelectItem value="manual">手动 Cookie</SelectItem>
              <SelectItem value="none">不处理</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">FlareSolverr URL</label>
          <Input
            className={`${settingsInputClassName} font-mono text-xs`}
            value={clearance.flaresolverr_url || ""}
            onChange={(event) => onChange({ flaresolverr_url: event.target.value })}
            placeholder="http://127.0.0.1:8191"
            disabled={isRegisterRunning || mode !== "flaresolverr"}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">超时（秒）</label>
          <Input
            className={settingsInputClassName}
            value={String(clearance.timeout_seconds || 60)}
            onChange={(event) => onChange({ timeout_seconds: Number(event.target.value) || 60 })}
            disabled={isRegisterRunning}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">刷新间隔（秒）</label>
          <Input
            className={settingsInputClassName}
            value={String(clearance.refresh_interval_seconds || 3600)}
            onChange={(event) => onChange({ refresh_interval_seconds: Number(event.target.value) || 0 })}
            disabled={isRegisterRunning}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Clearance 代理</label>
          <Input
            className={`${settingsInputClassName} font-mono text-xs`}
            value={clearance.proxy || ""}
            onChange={(event) => onChange({ proxy: event.target.value })}
            placeholder="留空跟随注册代理；direct 表示直连"
            disabled={isRegisterRunning}
          />
        </div>
      </div>

      <div
        className={`space-y-4 rounded-lg border p-4 transition ${
          mode === "manual"
            ? "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
            : "border-border/80 bg-muted/30"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-amber-600" />
          手动 Cookie 模式
          {mode === "manual" ? <Badge variant="warning">当前模式</Badge> : <Badge variant="secondary">未选用</Badge>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">User-Agent</label>
          <Input
            className={`${settingsInputClassName} font-mono text-xs`}
            value={clearance.user_agent || ""}
            onChange={(event) => onChange({ user_agent: event.target.value })}
            placeholder="建议与 cf_clearance 来源浏览器一致"
            disabled={isRegisterRunning || mode !== "manual"}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">cf_clearance</label>
          <Input
            className={`${settingsInputClassName} font-mono text-xs`}
            value={clearance.cf_clearance || ""}
            onChange={(event) => onChange({ cf_clearance: event.target.value })}
            placeholder={clearance.cf_credentials_configured ? STORED_SECRET_HINT : undefined}
            disabled={isRegisterRunning || mode !== "manual"}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">额外 Cookie</label>
          <Textarea
            className={`${settingsInputClassName} min-h-24 font-mono text-xs`}
            value={clearance.cf_cookies || ""}
            onChange={(event) => onChange({ cf_cookies: event.target.value })}
            placeholder={clearance.cf_credentials_configured ? STORED_SECRET_HINT : "name=value; name2=value2"}
            disabled={isRegisterRunning || mode !== "manual"}
          />
        </div>
      </div>
    </>
  );
}
