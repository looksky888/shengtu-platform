import { Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { RegisterField } from "./register-field";
import { RegisterGrokCaptchaPanel } from "./register-grok-captcha-panel";
import { RegisterMailProviderList } from "./register-mail-provider-list";
import type { RegisterCardState } from "./use-register-card";

export function RegisterConfigPanel({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <section className="space-y-5 overflow-y-auto border-b border-border/75 p-5 xl:border-r xl:border-b-0">
      <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-border/60 pb-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-surface-muted">
            <UserPlus className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">任务设置</h2>
            <p className="text-xs text-muted-foreground">并发线程、额度阈值与网络代理参数</p>
          </div>
        </div>
        <RegisterBaseFields state={state} />
        <RegisterClearanceToggle state={state} />
        <RegisterGrokCaptchaPanel state={state} />
      </div>

      <div className="space-y-3.5 border-t border-border/70 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground sm:text-[15px]">邮箱来源</h3>
            <p className="text-xs text-muted-foreground">请至少启用一种收信通道，支持多源轮询取号</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={config.enabled}
            onClick={() => state.addProvider()}
          >
            <Plus className="size-3.5" />
            添加来源
          </Button>
        </div>
        <RegisterMailSettings state={state} />
      </div>
    </section>
  );
}

function RegisterBaseFields({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <div className="grid gap-3.5 md:grid-cols-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">注册模式</label>
        <Select value={config.mode || "total"} onValueChange={(value) => state.setMode(value as "total" | "quota" | "available")} disabled={config.enabled}>
          <SelectTrigger aria-label="注册模式" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="total">注册总数</SelectItem><SelectItem value="quota">号池剩余额度</SelectItem><SelectItem value="available">可用账号数量</SelectItem></SelectContent>
        </Select>
      </div>
      <RegisterField label="注册总数" value={String(config.total)} onChange={state.setTotal} disabled={config.enabled || config.mode !== "total"} />
      <RegisterField label="线程数" value={String(config.threads)} onChange={state.setThreads} disabled={config.enabled} />
      <RegisterField label="注册代理" value={config.proxy} onChange={state.setProxy} placeholder="http://127.0.0.1:7890" disabled={config.enabled} />
      <RegisterField label="目标剩余额度" value={String(config.target_quota || "")} onChange={state.setTargetQuota} disabled={config.enabled || config.mode !== "quota"} />
      <RegisterField label="目标可用账号" value={String(config.target_available || "")} onChange={state.setTargetAvailable} disabled={config.enabled || config.mode !== "available"} />
      <RegisterField label="检查间隔（秒）" value={String(config.check_interval || "")} onChange={state.setCheckInterval} disabled={config.enabled || config.mode === "total"} />
    </div>
  );
}

function RegisterClearanceToggle({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  const clearanceEnabled = Boolean(config.clearance?.enabled);
  return (
    <div className="rounded-xl border border-border/75 bg-surface-muted/40 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-foreground sm:text-[13px]">Cloudflare / FlareSolverr 放行</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            节点地址、Cookie 与代理参数在「系统设置 → 代理与 FlareSolverr」统一维护；此处仅控制当前任务是否启用。
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className="text-xs font-medium text-muted-foreground">
            {clearanceEnabled ? "已启用" : "启用"}
          </span>
          <Switch
            size="sm"
            aria-label="启用注册放行"
            checked={clearanceEnabled}
            onCheckedChange={(checked) => state.setClearance({ enabled: Boolean(checked) })}
            disabled={config.enabled}
          />
        </div>
      </div>
    </div>
  );
}

function RegisterMailSettings({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 md:grid-cols-3">
        <RegisterField label="请求超时" value={String(config.mail.request_timeout || "")} onChange={(value) => state.setMailField("request_timeout", value)} disabled={config.enabled} />
        <RegisterField label="等待验证码超时" value={String(config.mail.wait_timeout || "")} onChange={(value) => state.setMailField("wait_timeout", value)} disabled={config.enabled} />
        <RegisterField label="轮询间隔" value={String(config.mail.wait_interval || "")} onChange={(value) => state.setMailField("wait_interval", value)} disabled={config.enabled} />
      </div>
      <RegisterMailProviderList state={state} />
    </div>
  );
}
