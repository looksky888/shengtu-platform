import { Activity, CircleAlert, Gauge, Layers, TriangleAlert } from "lucide-react";

import { GrokProviderIcon } from "@/app/accounts/grok-provider-icons";
import type { GrokProviderAccountsResponse } from "@/lib/grok-provider-accounts-api";

export function GrokProviderSummary({ summary }: { summary?: GrokProviderAccountsResponse["summary"] }) {
  const abnormal = summary ? summary.by_status.error + summary.by_status.disabled + summary.by_status.unknown : null;
  const total = summary?.total || 0;
  const routableTotal = summary
    ? (summary.routable_by_provider.build || 0) +
      (summary.routable_by_provider.web || 0) +
      (summary.routable_by_provider.console || 0)
    : null;
  const ratio = (value: number | null | undefined) =>
    total > 0 && value != null ? `${Math.round((value / total) * 100)}%` : "—";
  const failureEntries = Object.entries(summary?.recent_failure_codes || {}).slice(0, 4);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs transition-colors hover:border-border-strong/70">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground/75" aria-hidden="true" />
              池内账号总数
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-muted text-foreground ring-1 ring-border/60">
              <Layers className="size-3.5" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {summary?.total ?? "—"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1">
              <GrokProviderIcon provider="build" className="size-3" />
              Build {summary?.by_provider.build ?? "—"}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1">
              <GrokProviderIcon provider="web" className="size-3" />
              Web {summary?.by_provider.web ?? "—"}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1">
              <GrokProviderIcon provider="console" className="size-3" />
              Console {summary?.by_provider.console ?? "—"}
            </span>
          </div>
        </div>

        <div className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs transition-colors hover:border-border-strong/70">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              理论并发槽位
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              <Gauge className="size-3.5" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {summary?.theoretical_slots ?? "—"}
          </div>
          <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
            可调度账号 {routableTotal ?? "—"}（B {summary?.routable_by_provider.build ?? "—"} / W {summary?.routable_by_provider.web ?? "—"} / C {summary?.routable_by_provider.console ?? "—"}）
          </div>
        </div>

        <div className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs transition-colors hover:border-border-strong/70">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              异常与待检账号
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
              <CircleAlert className="size-3.5" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {abnormal ?? "—"}
          </div>
          <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
            占比 {ratio(abnormal)} · 异常 {summary?.by_status.error ?? "—"} · 停用 {summary?.by_status.disabled ?? "—"} · 待检 {summary?.by_status.unknown ?? "—"}
          </div>
        </div>

        <div className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs transition-colors hover:border-border-strong/70">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-rose-500" aria-hidden="true" />
              额度耗尽预警
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <TriangleAlert className="size-3.5" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {summary?.quota_exhausted ?? "—"}
          </div>
          <div className="mt-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
            占比 {ratio(summary?.quota_exhausted)} · 额度未知 {summary?.quota_unknown ?? "—"}
          </div>
        </div>
      </div>

      {failureEntries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/75 bg-surface px-3.5 py-2 text-xs shadow-2xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
            <Activity className="size-3.5 text-rose-500" />
            最近失败码
          </span>
          {failureEntries.map(([code, count]) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-surface-muted px-2 py-0.5 font-mono text-[11px] tabular-nums"
              title={code}
            >
              <span className="max-w-[14rem] truncate text-foreground">{code}</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">{count}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
