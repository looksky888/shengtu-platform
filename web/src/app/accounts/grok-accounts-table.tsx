import { LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatGrokDateTime,
  formatGrokMediaCapability,
  formatGrokPool,
  formatGrokQuotaText,
  formatGrokRefreshHint,
  formatGrokRuntimeStatus,
  hasGrokQuotaData,
} from "@/lib/grok-accounts-api";
import { cn } from "@/lib/utils";

import type { GrokAccountsController } from "./use-grok-accounts";

function runtimeTone(status?: string | null): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "cooling" || normalized === "rate_limited") return "border-amber-200 bg-amber-50 text-amber-900";
  if (normalized === "invalid" || normalized === "expired") return "border-rose-200 bg-rose-50 text-rose-800";
  if (normalized === "disabled") return "border-border bg-muted text-muted-foreground";
  return "border-border bg-muted/40 text-muted-foreground";
}

export function GrokAccountsTable({ controller }: { controller: GrokAccountsController }) {
  const { items, loading, busy, selected, setSelected, allSelected, handleStartOAuth } = controller;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1320px] text-left text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? items.map((item) => item.id) : [])} /></th>
            <th className="px-3 py-2">邮箱 / ID</th>
            <th className="px-3 py-2">号池 / 同步</th>
            <th className="px-3 py-2">注册状态</th>
            <th className="px-3 py-2">OAuth</th>
            <th className="px-3 py-2">账号健康</th>
            <th className="px-3 py-2">图片能力 / 额度</th>
            <th className="px-3 py-2">视频能力 / 额度</th>
            <th className="px-3 py-2">额度 A / F / E / H / C</th>
            <th className="px-3 py-2">成功 / 失败</th>
            <th className="px-3 py-2">最近使用</th>
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 ? <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground"><LoaderCircle className="mx-auto size-5 animate-spin" /></td></tr> : null}
          {!loading && items.length === 0 ? <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">暂无 Grok 账号。可导入 SSO，或通过注册机写入 Grok 号池。</td></tr> : null}
          {items.map((item) => {
            const checked = selected.includes(item.id);
            const quotaText = formatGrokQuotaText(item.quota);
            const refreshHint = formatGrokRefreshHint(item);
            const quotaReady = hasGrokQuotaData(item.quota);
            const oauth = item.oauth;
            const oauthModels = Array.isArray(oauth?.models) ? oauth.models.slice(0, 3).join(", ") : "";
            const imageCapability = formatGrokMediaCapability(item.capabilities?.image, item.media_quota?.image, item.account_health);
            const videoCapability = formatGrokMediaCapability(item.capabilities?.video, item.media_quota?.video, item.account_health);
            const runtimeStatus = String(item.runtime_status || "").toLowerCase();
            return (
              <tr key={item.id} className={cn("border-t border-border/70", runtimeStatus === "cooling" && "bg-amber-500/5", (runtimeStatus === "invalid" || runtimeStatus === "expired") && "bg-rose-500/5")}>
                <td className="px-3 py-2"><Checkbox checked={checked} onCheckedChange={(value) => setSelected((current) => value ? Array.from(new Set([...current, item.id])) : current.filter((id) => id !== item.id))} /></td>
                <td className="px-3 py-2"><div className="font-medium">{item.email || "—"}</div><div className="font-mono text-xs text-muted-foreground" title={item.id}>{item.token_preview || item.id}</div></td>
                <td className="px-3 py-2"><div className="text-xs font-medium">{formatGrokPool(item.pool)}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.sync_state === "synced" ? "已加入" : item.sync_state === "not_synced" ? "待加入" : item.sync_state || "—"}</div></td>
                <td className="px-3 py-2"><Badge variant="secondary">{item.disabled ? "disabled" : item.status || "active"}</Badge></td>
                <td className="px-3 py-2">
                  {oauth?.id ? <div><span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">已关联</span>{oauthModels ? <div className="mt-0.5 max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground" title={oauthModels}>{oauthModels}</div> : null}</div> : <div className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">{item.has_password ? "未关联" : "无密码"}</span>{item.has_password ? <button type="button" className="text-left text-xs text-sky-700 underline-offset-2 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void handleStartOAuth([item.id])}>获取 OAuth</button> : null}</div>}
                </td>
                <td className="px-3 py-2"><span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs", runtimeTone(item.runtime_status))}>{formatGrokRuntimeStatus(item.runtime_status, item.sync_state)}</span>{refreshHint ? <div className="mt-1 max-w-[14rem] truncate text-xs text-amber-700" title={refreshHint}>{refreshHint}</div> : null}</td>
                <MediaCell text={imageCapability} available={Boolean(item.capabilities?.image?.available)} />
                <MediaCell text={videoCapability} available={Boolean(item.capabilities?.video?.available)} />
                <td className="px-3 py-2 font-mono text-xs tabular-nums"><span className={cn("whitespace-normal leading-5", quotaReady ? "text-foreground" : "text-muted-foreground")}>{quotaText}</span></td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums"><span className="text-emerald-600">{item.use_count ?? 0}</span><span className="text-muted-foreground"> / </span><span className="text-rose-600">{item.fail_count ?? 0}</span></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{formatGrokDateTime(item.last_used_at ?? item.updated_at ?? item.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MediaCell({ text, available }: { text: string; available: boolean }) {
  return <td className="px-3 py-2 text-xs"><span className={cn("font-medium", available ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{text}</span></td>;
}
