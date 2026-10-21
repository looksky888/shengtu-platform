import { Activity, CircleAlert, Gauge, TriangleAlert } from "lucide-react";

import { GrokProviderIcon } from "@/app/accounts/grok-provider-icons";
import type { GrokProviderAccountsResponse } from "@/lib/grok-provider-accounts-api";

const CARDS = [
  { provider: "build", label: "Grok Build", tone: "bg-sky-500/10 text-sky-600" },
  { provider: "web", label: "Grok Web", tone: "bg-emerald-500/10 text-emerald-600" },
  { provider: "console", label: "Grok Console", tone: "bg-violet-500/10 text-violet-600" },
] as const;

export function GrokProviderSummary({ summary }: { summary?: GrokProviderAccountsResponse["summary"] }) {
  const abnormal = summary ? summary.by_status.error + summary.by_status.disabled + summary.by_status.unknown : null;
  const total = summary?.total || 0;
  const ratio = (value: number | null | undefined) => total > 0 && value != null ? `${Math.round((value / total) * 100)}%` : "—";
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border/70 bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4 lg:px-5">
      {CARDS.map(({ provider, label, tone }) => (
        <div key={provider} className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{label} 账号数</span>
            <span className={`rounded-lg p-2 ${tone}`}>
              <GrokProviderIcon provider={provider} className="size-4" />
            </span>
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {summary?.by_provider[provider] ?? "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            可调度账号 {summary?.routable_by_provider[provider] ?? "—"}
          </div>
        </div>
      ))}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">异常账号数</span>
          <span className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
            <CircleAlert className="size-4" />
          </span>
        </div>
        <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {abnormal ?? "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          占账号 {ratio(abnormal)} · 异常 {summary?.by_status.error ?? "—"} · 停用 {summary?.by_status.disabled ?? "—"} · 待检测 {summary?.by_status.unknown ?? "—"}
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">理论并发槽位</span>
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Gauge className="size-4" />
          </span>
        </div>
        <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {summary?.theoretical_slots ?? "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">活跃且有凭据账号的并发上限总和</div>
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">额度耗尽</span>
          <span className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
            <TriangleAlert className="size-4" />
          </span>
        </div>
        <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {summary?.quota_exhausted ?? "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          占账号 {ratio(summary?.quota_exhausted)} · 未知 {summary?.quota_unknown ?? "—"}
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">最近失败码</span>
          <span className="rounded-lg bg-rose-500/10 p-2 text-rose-600">
            <Activity className="size-4" />
          </span>
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {Object.entries(summary?.recent_failure_codes || {}).length
            ? Object.entries(summary?.recent_failure_codes || {})
                .slice(0, 3)
                .map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between gap-2">
                    <span className="max-w-[13rem] truncate font-mono" title={code}>{code}</span>
                    <span className="font-semibold tabular-nums text-rose-600">{count}</span>
                  </div>
                ))
            : <span>暂无失败记录</span>}
        </div>
      </div>
    </div>
  );
}
