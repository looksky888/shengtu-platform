"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import {
  AdminPageFrame,
  AdminUnderlineTabs,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAccountPoolHealth,
  fetchAdminImageTaskLogs,
  fetchImageTaskStats,
  fetchManagedRoles,
  fetchManagedUsers,
  type AccountPoolHealth,
  type CreationTask,
  type ImageTaskTodayStats,
  type QuarantineItem,
} from "@/lib/api";
import { listGrokProviderAccounts } from "@/lib/grok-provider-accounts-api";
import {
  fetchImageChannelModels,
  fetchImageChannels,
  type ImageChannel,
  type ImageChannelModel,
} from "@/lib/image-channel-api";
import { isVideoChannelModelId } from "@/lib/model-catalog-normalizers";
import {
  fetchPaymentStats,
  type PaymentStats,
} from "@/lib/payment-admin-api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

import {
  chinaCalendarDateKey,
  chinaThreeHourSlotLabel,
  isOverviewVideoTask,
  matchesOverviewChannelFilter,
  OVERVIEW_BUILTIN_CHANNELS,
  summarizeFilteredTodayImageCounts,
  type OverviewCapabilityFilter,
} from "./overview-filters";
import {
  OverviewSplineChart,
  type OverviewSplinePoint,
} from "./overview-spline-chart";
import { OverviewTabPanels, type OverviewTab } from "./overview-tab-panels";

type OverviewPeriod = "today" | "7d" | "30d";
type CapabilityFilter = OverviewCapabilityFilter;

const OVERVIEW_TABS = [
  { value: "models" as const, label: "模型分析" },
  { value: "pool" as const, label: "号池健康度" },
  { value: "errors" as const, label: "异常定位" },
  { value: "pricing" as const, label: "模型价格" },
] as const;

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

function periodToApiPeriod(period: OverviewPeriod): "day" | "week" | "month" {
  if (period === "7d") return "week";
  if (period === "30d") return "month";
  return "day";
}

export default function AdminOverviewPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin");

  const [period, setPeriod] = useState<OverviewPeriod>("7d");
  const [capability, setCapability] = useState<CapabilityFilter>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<OverviewTab>("models");

  const [loading, setLoading] = useState(true);
  const [taskStats, setTaskStats] = useState<ImageTaskTodayStats | null>(null);
  const [todayStats, setTodayStats] = useState<ImageTaskTodayStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<CreationTask[]>([]);
  const [poolHealth, setPoolHealth] = useState<AccountPoolHealth | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineItem[]>([]);
  const [grokAvailable, setGrokAvailable] = useState<number>(0);
  const [grokTotal, setGrokTotal] = useState<number>(0);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [adminRoleCount, setAdminRoleCount] = useState<number>(1);
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [channelModels, setChannelModels] = useState<
    Array<{ channel: ImageChannel; model: ImageChannelModel }>
  >([]);
  const [loadWarning, setLoadWarning] = useState<string>("");

  const loadPeriodStats = useCallback(async (targetPeriod: OverviewPeriod) => {
    try {
      const stats = await fetchImageTaskStats({ period: periodToApiPeriod(targetPeriod) });
      setTaskStats(stats);
    } catch {
      setLoadWarning((prev) => prev || "部分统计数据加载失败，已展示可用数据");
    }
  }, []);

  const loadDashboard = useCallback(async (targetPeriod: OverviewPeriod) => {
    setLoading(true);
    setLoadWarning("");
    try {
      const [
        statsRes,
        todayRes,
        logsRes,
        poolRes,
        grokRes,
        payRes,
        usersRes,
        rolesRes,
        channelsRes,
      ] = await Promise.allSettled([
        fetchImageTaskStats({ period: periodToApiPeriod(targetPeriod) }),
        fetchImageTaskStats({ period: "day" }),
        fetchAdminImageTaskLogs({ limit: 180, summary: true }),
        fetchAccountPoolHealth(),
        listGrokProviderAccounts({ page: 1, page_size: 1 }),
        fetchPaymentStats(),
        fetchManagedUsers({ page: 1, page_size: 1 }),
        fetchManagedRoles(),
        fetchImageChannels(),
      ]);

      const settledList = [
        statsRes,
        todayRes,
        logsRes,
        poolRes,
        grokRes,
        payRes,
        usersRes,
        rolesRes,
        channelsRes,
      ];
      const failedCount = settledList.filter((item) => item.status === "rejected").length;
      if (failedCount > 0) {
        setLoadWarning(`有 ${failedCount} 项概览数据源拉取失败，当前展示可用缓存或部分指标`);
      }

      if (statsRes.status === "fulfilled") setTaskStats(statsRes.value);
      if (todayRes.status === "fulfilled") setTodayStats(todayRes.value);
      if (logsRes.status === "fulfilled") setRecentTasks(logsRes.value.items || []);
      if (poolRes.status === "fulfilled") {
        setPoolHealth(poolRes.value.pool || null);
        setQuarantine(poolRes.value.quarantine || []);
      }
      if (grokRes.status === "fulfilled") {
        const summary = grokRes.value.summary;
        setGrokTotal(Number(summary?.total) || 0);
        setGrokAvailable(Number(summary?.by_status?.active) || 0);
      }
      if (payRes.status === "fulfilled") setPaymentStats(payRes.value);
      if (usersRes.status === "fulfilled") setTotalUsers(Number(usersRes.value.total) || 0);
      if (rolesRes.status === "fulfilled") {
        const roles = rolesRes.value.items || [];
        const adminLike = roles.filter(
          (r) => r.id === "admin" || (r.menu_paths || []).includes("/settings"),
        ).length;
        setAdminRoleCount(Math.max(1, adminLike));
      }
      if (channelsRes.status === "fulfilled") {
        const list = channelsRes.value.channels || [];
        setChannels(list);
        const modelSettled = await Promise.allSettled(
          list.map(async (channel) => {
            const res = await fetchImageChannelModels(channel.id);
            return (res.models || []).map((model) => ({ channel, model }));
          }),
        );
        const merged: Array<{ channel: ImageChannel; model: ImageChannelModel }> = [];
        for (const entry of modelSettled) {
          if (entry.status === "fulfilled") merged.push(...entry.value);
        }
        setChannelModels(merged);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadDashboard(period);
    // Period changes are handled cleanly by loadPeriodStats below without re-fetching metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDashboard, session]);

  useEffect(() => {
    if (!session) return;
    void loadPeriodStats(period);
  }, [loadPeriodStats, period, session]);

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const todayDateKey = chinaCalendarDateKey(new Date(now));
    const cutoffMs =
      period === "7d" ? now - 7 * 24 * 3600_000 : now - 30 * 24 * 3600_000;

    return recentTasks.filter((task) => {
      if (period === "today") {
        if (chinaCalendarDateKey(task.created_at) !== todayDateKey) return false;
      } else {
        const createdMs = Date.parse(task.created_at);
        if (Number.isFinite(createdMs) && createdMs < cutoffMs) return false;
      }
      if (capability === "video" && !isOverviewVideoTask(task, isVideoChannelModelId)) return false;
      if (capability === "image" && isOverviewVideoTask(task, isVideoChannelModelId)) return false;
      if (!matchesOverviewChannelFilter(task, channelFilter)) {
        return false;
      }
      const taskModel = (task.effective_model || task.model || "").trim();
      if (modelFilter !== "all" && taskModel !== modelFilter) return false;
      return true;
    });
  }, [capability, channelFilter, modelFilter, period, recentTasks]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const task of recentTasks) {
      const name = (task.effective_model || task.model || "").trim();
      if (name) set.add(name);
    }
    for (const item of channelModels) {
      if (item.model.upstream_model) set.add(item.model.upstream_model);
    }
    return Array.from(set).slice(0, 24);
  }, [channelModels, recentTasks]);

  const hasSubFilter =
    capability !== "all" || channelFilter !== "all" || modelFilter !== "all";

  const kpiMetrics = useMemo(() => {
    const statsSuccess = Number(taskStats?.success_tasks) || 0;
    const statsFailed = Number(taskStats?.failed_tasks) || 0;
    const statsTotal = statsSuccess + statsFailed;

    const sampleSuccess = filteredTasks.filter((t) => t.status === "success").length;
    const sampleFailed = filteredTasks.filter((t) => t.status === "error").length;
    const sampleTotal = filteredTasks.length;

    const totalTaskCount = hasSubFilter ? sampleTotal : Math.max(statsTotal, sampleTotal);
    const successCount = hasSubFilter ? sampleSuccess : (statsTotal > 0 ? statsSuccess : sampleSuccess);
    const failedCount = hasSubFilter ? sampleFailed : (statsTotal > 0 ? statsFailed : sampleFailed);
    const finishedCount = successCount + failedCount;
    const successRate =
      finishedCount > 0 ? ((successCount / finishedCount) * 100).toFixed(1) : "100.0";

    const durations = filteredTasks
      .map((t) => Number(t.duration_seconds) || 0)
      .filter((v) => v > 0 && v < 1800);
    const avgDuration =
      durations.length > 0
        ? `${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)}s`
        : "—";

    const gptAvail = Number(poolHealth?.available) || 0;
    const gptTotal = Number(poolHealth?.total) || 0;
    const poolAvailTotal = gptAvail + grokAvailable;
    const poolAllTotal = gptTotal + grokTotal;

    const totalRevenueFen = Number(paymentStats?.all_time?.succeeded_amount_fen) || 0;
    const todayRevenueFen = Number(paymentStats?.today?.succeeded_amount_fen) || 0;
    const filteredToday = summarizeFilteredTodayImageCounts(
      filteredTasks,
      capability,
      new Date(),
      isVideoChannelModelId,
    );
    const todayImages = hasSubFilter
      ? filteredToday.todayImages
      : todayStats
        ? Number(todayStats.success_images) || 0
        : filteredToday.todayImages;
    const todayFailedImages = hasSubFilter
      ? filteredToday.todayFailedImages
      : todayStats
        ? Number(todayStats.failed_images) || 0
        : filteredToday.todayFailedImages;

    return {
      totalTaskCount,
      successCount,
      failedCount,
      successRate,
      avgDuration,
      gptAvail,
      gptTotal,
      poolAvailTotal,
      poolAllTotal,
      totalRevenueFen,
      todayRevenueFen,
      todayImages,
      todayFailedImages,
    };
  }, [
    capability,
    filteredTasks,
    grokAvailable,
    grokTotal,
    hasSubFilter,
    paymentStats,
    poolHealth,
    taskStats,
    todayStats,
  ]);

  const splinePoints = useMemo<OverviewSplinePoint[]>(() => {
    const bucketMap = new Map<string, OverviewSplinePoint>();

    if (period === "today") {
      for (let h = 0; h < 24; h += 3) {
        const label = `${String(h).padStart(2, "0")}:00`;
        bucketMap.set(label, { label, requests: 0, succeeded: 0, failed: 0 });
      }
      for (const task of filteredTasks) {
        const label = chinaThreeHourSlotLabel(task.created_at);
        if (!label) continue;
        const entry = bucketMap.get(label) ?? { label, requests: 0, succeeded: 0, failed: 0 };
        entry.requests += 1;
        if (task.status === "success") entry.succeeded += 1;
        else if (task.status === "error") entry.failed += 1;
        bucketMap.set(label, entry);
      }
      return Array.from(bucketMap.values());
    }

    const days = period === "30d" ? 30 : 7;
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const dateKey = chinaCalendarDateKey(new Date(now.getTime() - i * 24 * 3600_000));
      const label = dateKey.slice(5);
      if (label) {
        bucketMap.set(label, { label, requests: 0, succeeded: 0, failed: 0 });
      }
    }

    for (const task of filteredTasks) {
      const dateKey = chinaCalendarDateKey(task.created_at);
      const label = dateKey ? dateKey.slice(5) : "";
      const entry = label ? bucketMap.get(label) : undefined;
      if (!entry) continue;
      entry.requests += 1;
      if (task.status === "success") entry.succeeded += 1;
      else if (task.status === "error") entry.failed += 1;
    }

    return Array.from(bucketMap.values());
  }, [filteredTasks, period]);

  const modelAnalyticsRows = useMemo(() => {
    const map = new Map<
      string,
      {
        model: string;
        kind: "视频" | "生图";
        total: number;
        succeeded: number;
        failed: number;
        durationSum: number;
        durationCount: number;
      }
    >();
    for (const task of filteredTasks) {
      const name = (task.effective_model || task.model || "gpt-image-1").trim();
      const row = map.get(name) ?? {
        model: name,
        kind: isOverviewVideoTask(task, isVideoChannelModelId) ? "视频" : "生图",
        total: 0,
        succeeded: 0,
        failed: 0,
        durationSum: 0,
        durationCount: 0,
      };
      row.total += 1;
      if (task.status === "success") row.succeeded += 1;
      if (task.status === "error") row.failed += 1;
      const dur = Number(task.duration_seconds) || 0;
      if (dur > 0 && dur < 1800) {
        row.durationSum += dur;
        row.durationCount += 1;
      }
      map.set(name, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  const errorTasks = useMemo(
    () => filteredTasks.filter((task) => task.status === "error").slice(0, 25),
    [filteredTasks],
  );

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  return (
    <AdminPageFrame
      groupLabel="概览"
      title="数据概览"
      description="实时聚合算力吞吐、出图交付率、GPT / Grok 号池水位与商业化营收指标。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadDashboard(period)}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </Button>
      }
    >
      {/* Compact Filter Bar */}
      {loadWarning ? (
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span>{loadWarning}</span>
          <button
            type="button"
            onClick={() => void loadDashboard(period)}
            className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
          >
            重新加载
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5">
            {(
              [
                { value: "today", label: "今日" },
                { value: "7d", label: "近 7 天" },
                { value: "30d", label: "近 30 天" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "h-6 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
                  period === opt.value
                    ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
                    : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-bg)] p-0.5">
            {(
              [
                { value: "all", label: "全部能力" },
                { value: "image", label: "生图" },
                { value: "video", label: "视频" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCapability(opt.value)}
                className={cn(
                  "h-6 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors",
                  capability === opt.value
                    ? "bg-[var(--admin-surface-2)] text-[var(--admin-text)]"
                    : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-8 w-[156px] text-[12px]">
              <SelectValue placeholder="全部渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供给渠道</SelectItem>
              {OVERVIEW_BUILTIN_CHANNELS.filter(
                (builtin) => !channels.some((ch) => ch.id === builtin.value),
              ).map((builtin) => (
                <SelectItem key={builtin.value} value={builtin.value}>
                  {builtin.label}
                </SelectItem>
              ))}
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="h-8 w-[176px] text-[12px]">
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
        </div>
      </div>

      {/* 6-Cell Connected Hairline KPI Strip */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--admin-border)] overflow-hidden rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            总用户 / 管理员角色
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {formatNumber(totalUsers)}{" "}
            <span className="text-[13px] font-normal text-[var(--admin-text-muted)]">
              / {adminRoleCount}
            </span>
          </div>
          <Link
            to="/admin/users"
            className="text-[11px] text-[var(--admin-text-subtle)] hover:text-[var(--admin-text)]"
          >
            管理用户与 RBAC →
          </Link>
        </div>

        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            生成任务量
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {formatNumber(kpiMetrics.totalTaskCount)}
          </div>
          <span className="text-[11px] tabular-nums text-[var(--admin-text-subtle)]">
            今日出图 {formatNumber(kpiMetrics.todayImages)} 张
            {kpiMetrics.todayFailedImages > 0
              ? ` · 失败 ${formatNumber(kpiMetrics.todayFailedImages)}`
              : ""}
          </span>
        </div>

        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            出图成功率
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {kpiMetrics.successRate}%
          </div>
          <span className="text-[11px] tabular-nums text-[var(--admin-text-subtle)]">
            成功 {formatNumber(kpiMetrics.successCount)} · 失败 {formatNumber(kpiMetrics.failedCount)}
          </span>
        </div>

        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            平均耗时
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {kpiMetrics.avgDuration}
          </div>
          <span className="text-[11px] text-[var(--admin-text-subtle)]">
            基于近期完成样本统计
          </span>
        </div>

        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            可用号池水位 (GPT + Grok)
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {formatNumber(kpiMetrics.poolAvailTotal)}{" "}
            <span className="text-[13px] font-normal text-[var(--admin-text-muted)]">
              / {formatNumber(kpiMetrics.poolAllTotal)}
            </span>
          </div>
          <span className="text-[11px] tabular-nums text-[var(--admin-text-subtle)]">
            GPT {kpiMetrics.gptAvail}/{kpiMetrics.gptTotal} · Grok {grokAvailable}/{grokTotal}
          </span>
        </div>

        <div className="flex min-h-[88px] flex-col justify-between p-3.5">
          <span className="text-[11.5px] font-medium text-[var(--admin-text-muted)]">
            累计支付营收
          </span>
          <div className="font-mono text-[20px] leading-tight font-semibold tabular-nums text-[var(--admin-text)]">
            {formatCurrencyYuan(kpiMetrics.totalRevenueFen)}
          </div>
          <span className="text-[11px] tabular-nums text-[var(--admin-text-subtle)]">
            今日入账 {formatCurrencyYuan(kpiMetrics.todayRevenueFen)}
          </span>
        </div>
      </div>

      {/* Three-Curve Smooth SVG Spline Area Chart */}
      <OverviewSplineChart
        points={splinePoints}
        subtitle={`统计窗口：${period === "today" ? "今日按 3 小时分桶" : period === "7d" ? "近 7 日趋势" : "近 30 日趋势"} · 悬停查看分桶明细`}
      />

      {/* Bottom Underline Tabs */}
      <div className="space-y-3">
        <AdminUnderlineTabs
          items={OVERVIEW_TABS.map((item) => ({
            ...item,
            badge:
              item.value === "models"
                ? modelAnalyticsRows.length
                : item.value === "errors"
                  ? errorTasks.length
                  : item.value === "pricing"
                    ? channelModels.length
                    : undefined,
          }))}
          value={activeTab}
          onValueChange={setActiveTab}
          syncQueryParam="tab"
          defaultValue="models"
        />

        <OverviewTabPanels
          activeTab={activeTab}
          modelAnalyticsRows={modelAnalyticsRows}
          poolHealth={poolHealth}
          quarantineCount={quarantine.length}
          grokTotal={grokTotal}
          grokAvailable={grokAvailable}
          errorTasks={errorTasks}
          channelModels={channelModels}
        />
      </div>
    </AdminPageFrame>
  );
}
