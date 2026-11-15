import { Activity, AlertTriangle, CheckCircle2, Layers, Server, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { AdminStatusBadge } from "@/components/admin";
import type { AdminOverviewResponse } from "@/lib/admin-overview-api";
import { formatDateTime, parseDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(n || 0)));
}

function formatClearanceLabel(mode: string): {
  label: string;
  tone: "success" | "info" | "neutral";
} {
  const normalized = (mode || "").trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "none" || normalized === "disabled") {
    return { label: "过盾：关闭", tone: "neutral" };
  }
  if (normalized === "auto" || normalized === "automatic") {
    return { label: "过盾：自动托管", tone: "success" };
  }
  if (normalized === "manual") {
    return { label: "过盾：手动凭证", tone: "info" };
  }
  return { label: `过盾：${mode.trim()}`, tone: "info" };
}

function formatRelativeTime(value: string): string {
  const parsed = parseDateTime(value);
  if (!parsed) return value || "—";
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 60_000) return "刚刚";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateTime(value, { compact: true, withSeconds: false });
}

function PoolStackedCard({
  title,
  manageHref,
  manageLabel,
  total,
  available,
  cooling,
  quarantined,
  disabled,
  extraMeta,
}: {
  title: string;
  manageHref: string;
  manageLabel: string;
  total: number;
  available: number;
  cooling: number;
  quarantined: number;
  disabled: number;
  extraMeta?: string;
}) {
  const denom = Math.max(1, total, available + cooling + quarantined + disabled);
  const availPct = Math.min(100, (available / denom) * 100);
  const coolPct = Math.min(100 - availPct, (cooling / denom) * 100);
  const quarPct = Math.min(100 - availPct - coolPct, (quarantined / denom) * 100);
  const disPct = Math.min(
    100 - availPct - coolPct - quarPct,
    (disabled / denom) * 100,
  );

  return (
    <div className="rounded-[8px] border border-[var(--admin-border)] bg-[var(--admin-surface-2)]/55 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-[var(--admin-text)]">
            {title}
          </span>
          <span className="rounded bg-[var(--admin-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--admin-text-muted)] tabular-nums">
            共 {formatNumber(total)}
          </span>
          {extraMeta ? (
            <span className="rounded border border-[var(--admin-border)] bg-[var(--admin-surface)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--admin-info)] tabular-nums">
              {extraMeta}
            </span>
          ) : null}
        </div>
        <Link
          to={manageHref}
          className="text-[11.5px] font-medium text-[var(--admin-accent)] hover:underline"
        >
          {manageLabel}
        </Link>
      </div>

      {/* Stacked Status Bar */}
      <div
        className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--admin-surface-3)]"
        role="img"
        aria-label={`${title}状态分布：可用 ${available}，冷却 ${cooling}，隔离 ${quarantined}，禁用 ${disabled}`}
      >
        {total > 0 ? (
          <>
            {availPct > 0 ? (
              <div
                className="h-full bg-[var(--admin-success)] transition-[width]"
                style={{ width: `${availPct}%` }}
                title={`可用：${available}`}
              />
            ) : null}
            {coolPct > 0 ? (
              <div
                className="h-full bg-[var(--admin-warning)] transition-[width]"
                style={{ width: `${coolPct}%` }}
                title={`冷却：${cooling}`}
              />
            ) : null}
            {quarPct > 0 ? (
              <div
                className="h-full bg-[var(--admin-danger)] transition-[width]"
                style={{ width: `${quarPct}%` }}
                title={`隔离：${quarantined}`}
              />
            ) : null}
            {disPct > 0 ? (
              <div
                className="h-full bg-[var(--admin-text-placeholder)]/55 transition-[width]"
                style={{ width: `${disPct}%` }}
                title={`禁用：${disabled}`}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Separated 4-State Breakdown */}
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[11px] tabular-nums">
        <div className="flex items-center justify-between rounded bg-[var(--admin-surface)] px-2 py-1">
          <span className="inline-flex items-center gap-1 text-[var(--admin-text-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--admin-success)]" />
            可用
          </span>
          <strong className="font-mono font-semibold text-[var(--admin-success)]">
            {formatNumber(available)}
          </strong>
        </div>
        <div className="flex items-center justify-between rounded bg-[var(--admin-surface)] px-2 py-1">
          <span className="inline-flex items-center gap-1 text-[var(--admin-text-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--admin-warning)]" />
            冷却
          </span>
          <strong className="font-mono font-semibold text-[var(--admin-warning)]">
            {formatNumber(cooling)}
          </strong>
        </div>
        <div className="flex items-center justify-between rounded bg-[var(--admin-surface)] px-2 py-1">
          <span className="inline-flex items-center gap-1 text-[var(--admin-text-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--admin-danger)]" />
            隔离
          </span>
          <strong className="font-mono font-semibold text-[var(--admin-danger)]">
            {formatNumber(quarantined)}
          </strong>
        </div>
        <div className="flex items-center justify-between rounded bg-[var(--admin-surface)] px-2 py-1">
          <span className="inline-flex items-center gap-1 text-[var(--admin-text-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--admin-text-placeholder)]" />
            禁用
          </span>
          <strong className="font-mono font-semibold text-[var(--admin-text-secondary)]">
            {formatNumber(disabled)}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function OverviewDiagnosticWorkspace({
  models,
  pools,
  errors,
}: {
  models: AdminOverviewResponse["models"];
  pools: AdminOverviewResponse["pools"];
  errors: AdminOverviewResponse["errors"];
}) {
  const maxModelVolume = Math.max(
    1,
    ...models.map((item) => Math.max(0, item.total)),
  );
  const clearance = formatClearanceLabel(pools.clearance_mode);
  const totalErrorOccurrences = errors.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid gap-3.5 lg:grid-cols-12">
      {/* Left Column (lg:col-span-7): Model Ranking & Quality */}
      <section className="flex flex-col overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-[var(--admin-accent)]" />
            <h2 className="text-[13px] font-semibold text-[var(--admin-text)]">
              模型调用与质量排行
            </h2>
            <span className="rounded-full bg-[var(--admin-surface-2)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--admin-text-secondary)] tabular-nums">
              {models.length}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11.5px]">
            <span className="hidden text-[var(--admin-text-subtle)] sm:inline">
              成功率 = 成功 / (成功 + 失败)
            </span>
            <Link
              to="/settings?tab=channels"
              className="font-medium text-[var(--admin-accent)] hover:underline"
            >
              渠道与模型配置 →
            </Link>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-12 text-center">
            <Activity className="size-6 text-[var(--admin-text-placeholder)]" />
            <p className="text-[13px] font-medium text-[var(--admin-text-secondary)]">
              当前筛选范围内暂无模型调用样本
            </p>
            <p className="text-[11.5px] text-[var(--admin-text-subtle)]">
              切换时间周期或放宽渠道/模型筛选后可查看调用分布与交付质量
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>模型标识</th>
                  <th>所属渠道</th>
                  <th>调用吞吐</th>
                  <th>成功率</th>
                  <th className="text-right">平均耗时</th>
                </tr>
              </thead>
              <tbody>
                {models.map((row, idx) => {
                  const finished = row.succeeded + row.failed;
                  const ratePct =
                    finished > 0 ? (row.succeeded / finished) * 100 : null;
                  const rateTone =
                    ratePct === null
                      ? "neutral"
                      : ratePct >= 95
                        ? "success"
                        : ratePct >= 80
                          ? "warning"
                          : "danger";
                  const volumeRatio = Math.max(
                    4,
                    Math.min(100, Math.round((row.total / maxModelVolume) * 100)),
                  );
                  const isVideo =
                    row.capability === "video" ||
                    row.model.toLowerCase().includes("video");
                  const channelLabel =
                    row.channel_name.trim() || row.channel_id.trim() || "默认供给";
                  const avgDuration =
                    row.avg_duration_ms > 0
                      ? `${(row.avg_duration_ms / 1000).toFixed(1)}s`
                      : "—";

                  return (
                    <tr key={`${row.model}-${row.channel_id}-${idx}`}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12.5px] font-medium text-[var(--admin-text)]">
                            {row.model}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
                              isVideo
                                ? "bg-[var(--admin-nav-active)] text-[var(--admin-accent)]"
                                : "bg-[var(--admin-surface-2)] text-[var(--admin-text-muted)]",
                            )}
                          >
                            {isVideo ? "视频" : "生图"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex max-w-[140px] truncate rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-[11px] text-[var(--admin-text-secondary)]">
                          {channelLabel}
                        </span>
                      </td>
                      <td className="min-w-[148px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 font-mono text-[11.5px] tabular-nums">
                            <span className="font-semibold text-[var(--admin-text)]">
                              {formatNumber(row.total)}
                            </span>
                            <span className="text-[10.5px] text-[var(--admin-text-muted)]">
                              成 {formatNumber(row.succeeded)} · 败 {formatNumber(row.failed)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--admin-surface-2)]">
                            <div
                              className="h-full rounded-full bg-[var(--admin-accent)]"
                              style={{ width: `${volumeRatio}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <AdminStatusBadge tone={rateTone}>
                          {ratePct !== null ? `${ratePct.toFixed(1)}%` : "—"}
                        </AdminStatusBadge>
                      </td>
                      <td className="text-right font-mono text-[12px] text-[var(--admin-text-secondary)] tabular-nums">
                        {avgDuration}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Right Column (lg:col-span-5): Pool Health Matrix + Top Failure Causes */}
      <div className="flex flex-col gap-3.5 lg:col-span-5">
        {/* Card 1: Pool & Infrastructure Health Matrix */}
        <section className="overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-[var(--admin-accent)]" />
              <h2 className="text-[13px] font-semibold text-[var(--admin-text)]">
                号池与基础设施健康矩阵
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <AdminStatusBadge tone={clearance.tone}>
                {clearance.label}
              </AdminStatusBadge>
              <AdminStatusBadge tone={pools.proxy_enabled ? "success" : "neutral"}>
                {pools.proxy_enabled ? "代理：已启用" : "代理：直连"}
              </AdminStatusBadge>
            </div>
          </div>

          <div className="space-y-2.5 p-3.5">
            <PoolStackedCard
              title="OpenAI 号池"
              manageHref="/accounts"
              manageLabel="管理号池 →"
              total={pools.openai.total}
              available={pools.openai.available}
              cooling={pools.openai.cooling}
              quarantined={pools.openai.quarantined}
              disabled={pools.openai.disabled}
            />
            <PoolStackedCard
              title="Grok 号池"
              manageHref="/accounts?platform=grok"
              manageLabel="管理 Grok →"
              total={pools.grok.total}
              available={pools.grok.available}
              cooling={pools.grok.cooling}
              quarantined={pools.grok.quarantined}
              disabled={pools.grok.disabled}
              extraMeta={`并发槽 ${formatNumber(pools.grok.theoretical_slots)}`}
            />
          </div>
        </section>

        {/* Card 2: Top Failure Reasons */}
        <section className="flex flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-[var(--admin-warning)]" />
              <h2 className="text-[13px] font-semibold text-[var(--admin-text)]">
                Top 失败原因定位
              </h2>
              {totalErrorOccurrences > 0 ? (
                <span className="rounded-full bg-[var(--admin-danger)]/12 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--admin-danger)] tabular-nums">
                  {formatNumber(totalErrorOccurrences)} 次
                </span>
              ) : null}
            </div>
            <Link
              to="/task-queue?tab=history"
              className="text-[11.5px] font-medium text-[var(--admin-accent)] hover:underline"
            >
              排错日志 →
            </Link>
          </div>

          {errors.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
              <CheckCircle2 className="size-5 text-[var(--admin-success)]" />
              <p className="text-[12.5px] font-medium text-[var(--admin-text-secondary)]">
                当期无失败或拦截异常
              </p>
              <p className="inline-flex items-center gap-1 text-[11px] text-[var(--admin-text-subtle)]">
                <ShieldCheck className="size-3.5" />
                生图与视频供给链路运行正常
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--admin-row-border)]">
              {errors.map((err, idx) => (
                <div
                  key={`${err.reason}-${err.model}-${idx}`}
                  className="flex flex-col gap-1.5 px-4 py-2.5 transition-colors hover:bg-[var(--admin-row-hover)]"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <p
                      className="line-clamp-2 min-w-0 flex-1 text-[12px] font-medium leading-snug text-[var(--admin-text)]"
                      title={err.reason}
                    >
                      {err.reason}
                    </p>
                    <span className="shrink-0 rounded-md border border-[var(--admin-danger)]/25 bg-[var(--admin-danger)]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--admin-danger)] tabular-nums">
                      ×{formatNumber(err.count)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--admin-text-muted)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {err.model ? (
                        <span className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--admin-text-secondary)]">
                          {err.model}
                        </span>
                      ) : null}
                      {err.channel_name ? (
                        <span className="rounded border border-[var(--admin-border)] px-1.5 py-0.5 text-[10.5px]">
                          {err.channel_name}
                        </span>
                      ) : null}
                    </div>
                    {err.last_seen_at ? (
                      <span
                        className="font-mono text-[10.5px] text-[var(--admin-text-subtle)] tabular-nums"
                        title={formatDateTime(err.last_seen_at)}
                      >
                        最近：{formatRelativeTime(err.last_seen_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
