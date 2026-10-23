import { Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STORED_SECRET_HINT } from "@/lib/register-types";

import { RegisterOutlookPoolEditor } from "./register-outlook-pool-editor";
import type { RegisterCardState } from "./use-register-card";

export function RegisterMailProviderList({ state }: { state: RegisterCardState }) {
  const { config, providers } = state;
  if (!config) return null;

  const sourceSummary = providers.map((provider, index) => {
    const type = String(provider.type || "tempmail_lol");
    const enabled = Boolean(provider.enable);
    const isOutlook = type === "outlook_token";
    const stats = (provider.mailboxes_stats || {}) as Record<string, number>;
    const unused = Number(stats.unused ?? 0);
    const failed = Number(stats.failed ?? 0);
    const count = Number(provider.mailboxes_count || 0);
    return { index, type, enabled, isOutlook, unused, failed, count };
  });
  const enabledCount = sourceSummary.filter((s) => s.enabled).length;
  const outlookUnused = sourceSummary.filter((s) => s.isOutlook).reduce((n, s) => n + s.unused, 0);
  const outlookFailed = sourceSummary.filter((s) => s.isOutlook).reduce((n, s) => n + s.failed, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-surface-muted/35 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-md border border-border/70 bg-surface px-2 py-1 font-medium text-foreground shadow-2xs">
            邮箱源 {providers.length} · 已启用 {enabledCount}
          </span>
          {sourceSummary.some((s) => s.isOutlook) ? (
            <>
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">Outlook 未使用 {outlookUnused}</span>
              <span className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-600 dark:text-rose-400">Outlook 失败 {outlookFailed}</span>
            </>
          ) : null}
          {sourceSummary.map((s) => (
            <span
              key={s.index}
              className={`rounded-md px-2 py-1 font-mono ${s.enabled ? "border border-foreground/20 bg-surface text-foreground shadow-2xs" : "bg-surface-muted text-muted-foreground"}`}
              title={`#${s.index + 1} ${s.type}`}
            >
              {s.type}
              {s.isOutlook && s.count ? ` · ${s.count}` : ""}
              {!s.enabled ? "（关）" : ""}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          多源会按已启用 provider 轮询取邮箱。Outlook 池与 iCloud / 临时邮箱可并存；失败邮箱请用池内「清除失败状态」释放。
        </p>
      </div>
      {providers.map((provider, index) => <RegisterMailProvider key={index} state={state} provider={provider} index={index} />)}
    </div>
  );
}

function RegisterMailProvider({ state, provider, index }: { state: RegisterCardState; provider: RegisterCardState["providers"][number]; index: number }) {
  const { config, providers } = state;
  if (!config) return null;
  const type = String(provider.type || "tempmail_lol");
  const domains = Array.isArray(provider.domain) ? provider.domain.map(String).join("\n") : "";
  const domainPlaceholder = type === "tempmail_lol" ? "每行一个域名，留空则使用服务默认域名" : "每行一个域名";
  return (
    <div className="space-y-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm text-stone-700">
          <Checkbox aria-label={`启用邮箱服务 ${index + 1}`} checked={Boolean(provider.enable)} onCheckedChange={(checked) => state.updateProvider(index, { enable: Boolean(checked) })} disabled={config.enabled} />启用
        </label>
        <button type="button" className="rounded-lg p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50" onClick={() => state.deleteProvider(index)} disabled={config.enabled || providers.length <= 1} title="删除 provider"><Trash2 className="size-4" /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderTypeSelect type={type} disabled={config.enabled} onChange={(value) => state.updateProviderType(index, value)} />
        {type === "cloudflare_temp_email" || type === "moemail" || type === "icloud_local" || type === "icloud_api" ? (
          <ProviderInput
            label="API Base"
            value={String(provider.api_base || "")}
            placeholder={type === "icloud_local" ? "http://icloud-privacy-mail:8787（可空）" : type.startsWith("icloud") ? "https://your-icloud-api" : undefined}
            disabled={config.enabled}
            onChange={(value) => state.updateProvider(index, { api_base: value })}
          />
        ) : null}
        {type === "cloudflare_temp_email" ? <ProviderInput label="Admin Password" value={String(provider.admin_password || "")} placeholder={provider.admin_password_configured ? STORED_SECRET_HINT : undefined} disabled={config.enabled} onChange={(value) => state.updateProvider(index, { admin_password: value })} /> : null}
        {type === "tempmail_lol" || type === "duckmail" || type === "gptmail" || type === "moemail" || type === "icloud_api" ? (
          <ProviderInput label="API Key" value={String(provider.api_key || "")} placeholder={provider.api_key_configured ? STORED_SECRET_HINT : undefined} disabled={config.enabled} onChange={(value) => state.updateProvider(index, { api_key: value })} />
        ) : null}
        {type === "duckmail" || type === "gptmail" ? <ProviderInput label="Default Domain" value={String(provider.default_domain || "")} placeholder={type === "duckmail" ? "duckmail.sbs" : ""} disabled={config.enabled} onChange={(value) => state.updateProvider(index, { default_domain: value })} /> : null}
        {type === "icloud_local" || type === "icloud_api" ? (
          <>
            <ProviderInput label="Project" value={String(provider.project || "openai")} placeholder="openai 或 grok" disabled={config.enabled} onChange={(value) => state.updateProvider(index, { project: value })} />
            <ProviderInput label="Keyword" value={String(provider.keyword || "")} placeholder="OpenAI / xAI" disabled={config.enabled} onChange={(value) => state.updateProvider(index, { keyword: value })} />
          </>
        ) : null}
        {type === "moemail" ? <ProviderInput label="Expiry Time" value={String(provider.expiry_time || "")} disabled={config.enabled} onChange={(value) => state.updateProvider(index, { expiry_time: Number(value) || 0 })} /> : null}
        {type === "outlook_token" ? (
          <div className="space-y-2">
            <label className="text-sm text-stone-700">读取方式</label>
            <Select
              value={["graph", "imap", "auto"].includes(String(provider.mode || "")) ? String(provider.mode) : "auto"}
              onValueChange={(value) => state.updateProvider(index, { mode: value })}
              disabled={config.enabled}
            >
              <SelectTrigger aria-label="Outlook 读取方式" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto（Graph 失败则 IMAP，推荐）</SelectItem>
                <SelectItem value="graph">Graph API（Mail.Read）</SelectItem>
                <SelectItem value="imap">IMAP XOAUTH2</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-stone-500">市面 Outlook 号池多为 IMAP 授权；auto 会先试 Graph，失败自动改 IMAP。</p>
          </div>
        ) : null}
      </div>
      {type === "tempmail_lol" || type === "cloudflare_temp_email" || type === "moemail" ? (
        <div className="space-y-2">
          <label className="text-sm text-stone-700">Domain</label>
          <Textarea aria-label="邮箱域名" value={domains} onChange={(event) => state.updateProvider(index, { domain: event.target.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) })} placeholder={domainPlaceholder} className="min-h-20 rounded-lg font-mono text-xs" disabled={config.enabled} />
        </div>
      ) : null}
      {type === "outlook_token" ? <RegisterOutlookPoolEditor state={state} provider={provider} index={index} disabled={config.enabled} /> : null}
    </div>
  );
}

function ProviderTypeSelect({ type, disabled, onChange }: { type: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-stone-700">类型</label>
      <Select value={type} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label="邮箱来源类型" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="cloudflare_temp_email">cloudflare_temp_email</SelectItem>
          <SelectItem value="tempmail_lol">tempmail_lol</SelectItem>
          <SelectItem value="duckmail">duckmail</SelectItem>
          <SelectItem value="gptmail">gptmail(未测试)</SelectItem>
          <SelectItem value="moemail">moemail</SelectItem>
          <SelectItem value="outlook_token">outlook_token (Outlook/Hotmail 邮箱池)</SelectItem>
          <SelectItem value="icloud_local">icloud_local（本系统 iCloud sidecar）</SelectItem>
          <SelectItem value="icloud_api">icloud_api（外部 iCloud API + Key）</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ProviderInput({ label, value, disabled, placeholder, onChange }: { label: string; value: string; disabled?: boolean; placeholder?: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><label className="text-sm text-stone-700">{label}</label><Input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 rounded-lg" disabled={disabled} /></div>;
}
