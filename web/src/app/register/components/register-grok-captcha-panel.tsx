import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { RegisterField } from "./register-field";
import type { RegisterCardState } from "./use-register-card";

export function RegisterGrokCaptchaPanel({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config || config.target !== "grok") return null;

  const grok = (config.grok || {}) as Record<string, unknown>;
  const provider = String(grok.provider || "yescaptcha");
  const pool = String(grok.grok2api_pool || "super");
  const autoNsfw = Boolean(grok.grok2api_auto_nsfw);
  const verifyOnImport = Boolean(grok.grok2api_verify_on_import);

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-surface-muted/35 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Grok 注册协议 / 打码</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Turnstile 解题：YesCaptcha / 2Captcha / 本地 captcha-solver。未配置时 Grok 注册会卡在验证码。
          需 <code className="rounded bg-surface px-1 py-0.5 font-mono text-foreground">REGISTER_BACKEND=python</code>。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Turnstile 服务</label>
          <Select value={provider} onValueChange={(value) => state.setGrokField("provider", value)} disabled={config.enabled}>
            <SelectTrigger aria-label="Turnstile 服务" className="h-9 rounded-lg bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yescaptcha">YesCaptcha</SelectItem>
              <SelectItem value="2captcha">2Captcha</SelectItem>
              <SelectItem value="local">本地 Captcha Solver</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {provider !== "local" ? (
          <RegisterField
            label="API Key"
            value={String(grok.api_key || "")}
            onChange={(value) => state.setGrokField("api_key", value)}
            disabled={config.enabled}
            placeholder="打码平台 Key"
          />
        ) : null}
        <RegisterField
          label="API Base"
          value={String(grok.api_base || "")}
          onChange={(value) => state.setGrokField("api_base", value)}
          disabled={config.enabled}
          placeholder={provider === "yescaptcha" ? "https://api.yescaptcha.com" : provider === "2captcha" ? "https://api.2captcha.com" : "http://127.0.0.1:8080"}
        />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">入池类型</label>
          <Select
            value={["basic", "super", "heavy", "auto"].includes(pool) ? pool : "super"}
            onValueChange={(value) => state.setGrokField("grok2api_pool", value)}
            disabled={config.enabled}
          >
            <SelectTrigger aria-label="Grok 入池类型" className="h-9 rounded-lg bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="super">Super（生图推荐）</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="heavy">Heavy</SelectItem>
              <SelectItem value="auto">Auto → Super</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <RegisterField
          label="HTTP 超时（秒）"
          value={String(grok.request_timeout ?? 60)}
          onChange={(value) => state.setGrokField("request_timeout", Number(value) || 60)}
          disabled={config.enabled}
        />
        <RegisterField
          label="解题超时（秒）"
          value={String(grok.captcha_timeout ?? 180)}
          onChange={(value) => state.setGrokField("captcha_timeout", Number(value) || 180)}
          disabled={config.enabled}
        />
        <RegisterField
          label="轮询间隔（秒）"
          value={String(grok.captcha_poll_interval ?? 3)}
          onChange={(value) => state.setGrokField("captcha_poll_interval", Number(value) || 3)}
          disabled={config.enabled}
        />
      </div>
      <div className="grid gap-2 rounded-lg border border-border/60 bg-surface p-3 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
          <Checkbox
            className="mt-0.5"
            aria-label="导入后刷新验证"
            checked={verifyOnImport}
            disabled={config.enabled}
            onCheckedChange={(checked) => state.setGrokField("grok2api_verify_on_import", Boolean(checked))}
          />
          <span>
            <strong className="font-medium">导入后刷新验证</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">加入运行池后检查登录态、运行状态和真实额度。</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
          <Checkbox
            className="mt-0.5"
            aria-label="导入后开启 NSFW"
            checked={autoNsfw}
            disabled={config.enabled}
            onCheckedChange={(checked) => state.setGrokField("grok2api_auto_nsfw", Boolean(checked))}
          />
          <span>
            <strong className="font-medium">导入后开启 NSFW</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">由内置 Grok 运行时完成检测与设置（参考 gptGrok2api）。</span>
          </span>
        </label>
      </div>
    </div>
  );
}
