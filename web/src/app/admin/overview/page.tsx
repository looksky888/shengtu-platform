"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clock, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";

import { AdminPageFrame } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAdminOverview,
  type AdminOverviewResponse,
  type OverviewCapability,
  type OverviewPeriod,
} from "@/lib/admin-overview-api";
import { formatDateTime } from "@/lib/datetime";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

import { OVERVIEW_BUILTIN_CHANNELS } from "./overview-filters";
import {
  OverviewSplineChart,
  type OverviewSplinePoint,
} from "./overview-spline-chart";
import { OverviewDiagnosticWorkspace } from "./overview-tab-panels";

const PERIOD_OPTIONS: ReadonlyArray<{
  value: OverviewPeriod;
  label: string;
  revenueTitle: string;
  trendSubtitle: string;
}> = [
  {
    value: "today",
    label: "今日",
    revenueTitle: "今日营收",
    trendSubtitle: "今日滚动窗口（按小时/时段分桶）",
  },
  {
    value: "7d",
    label: "近 7 天",
    revenueTitle: "近 7 日营收",
    trendSubtitle: "近 7 天滚动窗口（按日分桶）",
  },
  {
    value: "30d",
    label: "近 30 天",
    revenueTitle: "近 30 日营收",
    trendSubtitle: "近 30 天滚动窗口（按日分桶）",
  },
];

const CAPABILITY_OPTIONS: ReadonlyArray<{
  value: OverviewCapability;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "image", label: "生图" },
  { value: "video", label: "视频" },
];

function formatCurrencyYuan(fen: number): string {
  const yuan = (Number(fen) || 0) / 100;
  return `¥${yuan.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(n || 0)));
}

function formatUpdatedClock(generatedAt: string): string {
  if (!generatedAt) return "";
  const formatted = formatDateTime(generatedAt, { withSeconds: true });
  return formatted.length >= 8 ? formatted.slice(-8) : formatted;
}

function OverviewLoadingSkeleton() {
  return (
    <div className="space-y-3.5" aria-busy="true" aria-label="正在加载经营概况数据">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--admin-border)] overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="flex min-h-[94px] flex-col justify-between p-3.5">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="my-2 h-6 w-28 rounded" />
            <Skeleton className="h-3 w-36 rounded" />
          </div>
        ))}
      </div>

      <div className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-3 w-56 rounded" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-[220px] w-full rounded-lg" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <div className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 lg:col-span-7">
          <Skeleton className="mb-3 h-4 w-40 rounded" />
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-9 w-full rounded" />
            ))}
          </div>
        </div>
        <div className="space-y-3.5 lg:col-span-5">
          <div className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
            <Skeleton className="mb-3 h-4 w-44 rounded" />
            <Skeleton className="mb-2.5 h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <div className="rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
            <Skeleton className="mb-3 h-4 w-36 rounded" />
            <Skeleton className="mb-2 h-12 w-full rounded" />
            <Skeleton className="h-12 w-full rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/overview");

  const [period, setPeriod] = useState<OverviewPeriod>("7d");
  const [capability, setCapability] = useState<OverviewCapability>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");

  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadOverview = useCallback(
    async (params: {
      period: OverviewPeriod;
      capability: OverviewCapability;
      channel: string;
      model: string;
    }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError("");
      try {
        const res = await fetchAdminOverview(params, controller.signal);
        if (controller.signal.aborted) return;
        setData(res);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "经营概况数据拉取失败，请稍后重试",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    void loadOverview({
      period,
      capability,
      channel: channelFilter,
      model: modelFilter,
    });
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [capability, channelFilter, loadOverview, modelFilter, period, session]);

  const hasSubFilter =
    capability !== "all" || channelFilter !== "all" || modelFilter !== "all";

  const handleResetFilters = () => {
    setCapability("all");
    setChannelFilter("all");
    setModelFilter("all");
  };

  const handleManualRefresh = () => {
    void loadOverview({
      period,
      capability,
      channel: channelFilter,
      model: modelFilter,
    });
  };

  const channelOptions = useMemo(() => {
    const serverChannels = data?.filter_options.channels ?? [];
    const base =
      serverChannels.length > 0
        ? serverChannels
        : OVERVIEW_BUILTIN_CHANNELS.map((item) => ({
            id: item.value,
            name: item.label,
            type: "builtin",
            enabled: true,
          }));
    if (
      channelFilter !== "all" &&
      !base.some((item) => item.id === channelFilter)
    ) {
      return [
        ...base,
        {
          id: channelFilter,
          name: channelFilter,
          type: "custom",
          enabled: true,
        },
      ];
    }
    return base;
  }, [channelFilter, data?.filter_options.channels]);

  const modelOptions = useMemo(() => {
    const raw = data?.filter_options.models ?? [];
    if (modelFilter !== "all" && !raw.includes(modelFilter)) {
      return [modelFilter, ...raw];
    }
    return raw;
  }, [data?.filter_options.models, modelFilter]);

  const splinePoints = useMemo<OverviewSplinePoint[]>(() => {
    if (!data) return [];
    return data.series.map((bucket) => ({
      bucket: bucket.bucket,
      label: bucket.label,
      requests: bucket.total,
      succeeded: bucket.succeeded,
      failed: bucket.failed,
      images: bucket.images,
      videos: bucket.videos,
    }));
  }, [data]);

  const periodMeta =
    PERIOD_OPTIONS.find((item) => item.value === period) ?? PERIOD_OPTIONS[1]!;

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const updatedClock = data?.generated_at ? formatUpdatedClock(data.generated_at) : "";
  const isInitialLoading = data === null && loading;

  return (
    <AdminPageFrame
      groupLabel="概览"
      title="经营概况"
      description="实时聚合生成吞吐、交付成功率、号池可用算力与商业化实收指标。"
      actions={
        <div className="flex items-center gap-2.5">
          {updatedClock ? (
            <span
              className="hidden items-center gap-1 font-mono text-[11.5px] text-[var(--admin-text-muted)] tabular-nums sm:inline-flex"
              title={formatDateTime(data?.generated_at)}
            >
              <Clock className="size-3 text-[var(--admin-text-subtle)]" />
              更新于 {updatedClock}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={handleManualRefresh}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
      }
    >
      {/* Unified Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Segmented Control */}
          <div
            role="group"
            aria-label="统计周期"
            className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeriod(opt.value)}
                  className={cn(
                    "h-7 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
                    active
                      ? "bg-[var(--admin-accent)] font-semibold text-[var(--admin-accent-fg)] shadow-2xs"
                      : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Capability Segmented Pills (Matching Visual Contrast) */}
          <div
            role="group"
            aria-label="能力类型"
            className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5"
          >
            {CAPABILITY_OPTIONS.map((opt) => {
              const active = capability === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCapability(opt.value)}
                  className={cn(
                    "h-7 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
                    active
                      ? "bg-[var(--admin-accent)] font-semibold text-[var(--admin-accent-fg)] shadow-2xs"
                      : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-[164px] text-[12px]">
              <SelectValue placeholder="全部供给渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供给渠道</SelectItem>
              {channelOptions.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.enabled ? ch.name : `${ch.name} (已停用)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="h-8 w-[188px] text-[12px]">
              <SelectValue placeholder="全部模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模型</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasSubFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 gap-1 px-2.5 text-[12px] text-[var(--admin-accent)] hover:bg-[var(--admin-nav-hover)] hover:text-[var(--admin-accent)]"
            >
              <RotateCcw className="size-3.5" />
              重置筛选
            </Button>
          ) : null}
        </div>
      </div>

      {/* Error Alert */}
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
          >
            重试拉取
          </button>
        </div>
      ) : null}

      {isInitialLoading ? (
        <OverviewLoadingSkeleton />
      ) : data ? (
        <>
          {/* 6-Card Executive KPI Strip */}
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--admin-border)] overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
            {/* 1. 当期生成任务 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                当期生成任务
              </span>
              <div className="font-mono text-[21px] leading-tight font-semibold text-[var(--admin-text)] tabular-nums">
                {formatNumber(data.tasks.total)}
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                成功 {formatNumber(data.tasks.succeeded)} · 失败{" "}
                {formatNumber(data.tasks.failed)} · 进行中{" "}
                {formatNumber(data.tasks.running + data.tasks.queued)}
              </span>
            </div>

            {/* 2. 任务成功率 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                  任务成功率
                </span>
                {data.tasks.finished === 0 ? (
                  <span className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--admin-text-subtle)]">
                    当期无已结束任务
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  "font-mono text-[21px] leading-tight font-semibold tabular-nums",
                  data.tasks.finished === 0
                    ? "text-[var(--admin-text-muted)]"
                    : data.tasks.success_rate >= 95
                      ? "text-[var(--admin-success)]"
                      : data.tasks.success_rate >= 80
                        ? "text-[var(--admin-warning)]"
                        : "text-[var(--admin-danger)]",
                )}
              >
                {data.tasks.finished > 0
                  ? `${data.tasks.success_rate.toFixed(1)}%`
                  : "—"}
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                产出图片 {formatNumber(data.tasks.total_images)} 张 · 视频{" "}
                {formatNumber(data.tasks.total_videos)} 条
              </span>
            </div>

            {/* 3. 平均生成耗时 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                平均生成耗时
              </span>
              <div className="font-mono text-[21px] leading-tight font-semibold text-[var(--admin-text)] tabular-nums">
                {data.tasks.avg_duration_ms > 0
                  ? `${(data.tasks.avg_duration_ms / 1000).toFixed(1)}s`
                  : "—"}
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                运行中 {formatNumber(data.tasks.running)} · 排队中{" "}
                {formatNumber(data.tasks.queued)}
              </span>
            </div>

            {/* 4. 当期实收营收 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                  {periodMeta.revenueTitle}
                </span>
                <Link
                  to="/payment-admin"
                  className="text-[10.5px] text-[var(--admin-accent)] hover:underline"
                >
                  订单 →
                </Link>
              </div>
              <div className="font-mono text-[21px] leading-tight font-semibold text-[var(--admin-text)] tabular-nums">
                {formatCurrencyYuan(data.payments.period_amount_fen)}
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                成交 {formatNumber(data.payments.period_succeeded_orders)} 笔 · 累计总收{" "}
                {formatCurrencyYuan(data.payments.all_time_amount_fen)}
              </span>
            </div>

            {/* 5. 注册与付费用户 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                  注册与付费用户
                </span>
                <Link
                  to="/users"
                  className="text-[10.5px] text-[var(--admin-accent)] hover:underline"
                >
                  用户 →
                </Link>
              </div>
              <div className="font-mono text-[21px] leading-tight font-semibold text-[var(--admin-text)] tabular-nums">
                {formatNumber(data.users.total_users)}
                {data.users.active_users > 0 ? (
                  <span className="ml-1.5 text-[12px] font-normal text-[var(--admin-text-muted)]">
                    活跃 {formatNumber(data.users.active_users)}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                付费用户 {formatNumber(data.users.paid_users)} · 剩余总积分{" "}
                {formatNumber(data.users.total_credits_balance)}
              </span>
            </div>

            {/* 6. 号池可用算力 */}
            <div className="flex min-h-[96px] flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
                  号池可用算力
                </span>
                <Link
                  to="/accounts"
                  className="text-[10.5px] text-[var(--admin-accent)] hover:underline"
                >
                  号池 →
                </Link>
              </div>
              <div className="font-mono text-[21px] leading-tight font-semibold text-[var(--admin-text)] tabular-nums">
                {formatNumber(
                  data.pools.openai.available + data.pools.grok.available,
                )}{" "}
                <span className="text-[13px] font-normal text-[var(--admin-text-muted)]">
                  /{" "}
                  {formatNumber(data.pools.openai.total + data.pools.grok.total)}
                </span>
              </div>
              <span className="text-[11px] text-[var(--admin-text-subtle)] tabular-nums">
                冷却{" "}
                {formatNumber(
                  data.pools.openai.cooling + data.pools.grok.cooling,
                )}{" "}
                · 隔离{" "}
                {formatNumber(
                  data.pools.openai.quarantined + data.pools.grok.quarantined,
                )}{" "}
                · Grok 并发槽 {formatNumber(data.pools.grok.theoretical_slots)}
              </span>
            </div>
          </div>

          {/* Upgraded Monotone Clamped Trend Spline Chart */}
          <OverviewSplineChart
            points={splinePoints}
            subtitle={`统计窗口：${periodMeta.trendSubtitle} · 支持鼠标悬停、触屏点按或键盘方向键检视分桶明细`}
          />

          {/* 2-Column Diagnostic Workspace */}
          <OverviewDiagnosticWorkspace
            models={data.models}
            pools={data.pools}
            errors={data.errors}
          />
        </>
      ) : null}
    </AdminPageFrame>
  );
}
