import { LoaderCircle, Plus, Save, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { RegisterField } from "./register-field";
import { RegisterGrokCaptchaPanel } from "./register-grok-captcha-panel";
import { RegisterMailProviderList } from "./register-mail-provider-list";
import type { RegisterCardState } from "./use-register-card";

export function RegisterConfigPanel({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <section className="space-y-5 overflow-y-auto border-b border-border p-4 xl:border-r xl:border-b-0">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-muted">
              <UserPlus className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">任务设置</h2>
              <p className="text-xs text-muted-foreground">平台、模式、线程与代理</p>
            </div>
          </div>
          <Button
            className="h-9 rounded-lg px-4"
            onClick={() => void state.save()}
            disabled={state.isSaving || config.enabled}
          >
            {state.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存配置
          </Button>
        </div>
        <RegisterBaseFields state={state} />
        <RegisterClearanceToggle state={state} />
        <RegisterGrokCaptchaPanel state={state} />
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">邮箱来源</h3>
            <p className="text-xs text-muted-foreground">请至少启用一种邮箱服务</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-md"
            disabled={config.enabled}
            onClick={() => state.addProvider()}
          >
            <Plus className="size-4" />
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
  // 平台切换在 RegisterCard 顶部分段，此处只保留任务参数
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <label className="text-sm text-stone-700">注册模式</label>
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
  return (
    <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Cloudflare / FlareSolverr</h3>
          <p className="mt-1 text-xs text-stone-500">详细 URL、Cookie、代理等参数请到「设置 → 注册与 FlareSolverr」统一配置。这里仅控制本次注册任务是否启用。</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <Checkbox aria-label="启用注册放行" checked={Boolean(config.clearance?.enabled)} onCheckedChange={(checked) => state.setClearance({ enabled: Boolean(checked) })} disabled={config.enabled} />启用
        </label>
      </div>
    </div>
  );
}

function RegisterMailSettings({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-3">
        <RegisterField label="请求超时" value={String(config.mail.request_timeout || "")} onChange={(value) => state.setMailField("request_timeout", value)} disabled={config.enabled} />
        <RegisterField label="等待验证码超时" value={String(config.mail.wait_timeout || "")} onChange={(value) => state.setMailField("wait_timeout", value)} disabled={config.enabled} />
        <RegisterField label="轮询间隔" value={String(config.mail.wait_interval || "")} onChange={(value) => state.setMailField("wait_interval", value)} disabled={config.enabled} />
      </div>
      <RegisterMailProviderList state={state} />
    </div>
  );
}
