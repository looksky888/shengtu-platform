"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchImageTaskStats, type ImageTaskTodayStats } from "@/lib/api";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import { SettingsCard, settingsInputClassName } from "./settings-ui";

type StatsPeriod = "day" | "week" | "month";

function numberText(value?: number) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function todayInChina() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function periodLabel(period: StatsPeriod) {
  if (period === "week") return "自然周汇总";
  if (period === "month") return "自然月汇总";
  return "单日统计";
}

function rangeText(stats: ImageTaskTodayStats | null) {
  if (!stats) return "Asia/Shanghai (UTC+8)";
  const start = stats.start_date || stats.date;
  const end = stats.end_date || stats.date;
  return start === end ? `${start}（北京时间）` : `${start} 至 ${end}（北京时间）`;
}

export function ImageTaskStatsCard({
  active = true,
}: { active?: boolean } = {}) {
  const [stats, setStats] = useState<ImageTaskTodayStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<StatsPeriod>("day");
  const [date, setDate] = useState(() => todayInChina());
  const lastSilentErrorToastAtRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadRequestSeq = useRef(0);
  const pageVisible = usePageVisible();

  const isToday = useMemo(
    () => period === "day" && date === todayInChina(),
    [date, period]
  );

  const load = useCallback(
    async (silent = false, nextPeriod = period, nextDate = date) => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      const seq = ++loadRequestSeq.current;
      if (!silent) setIsLoading(true);
      try {
        setStats(
          await fetchImageTaskStats({
            period: nextPeriod,
            date: nextDate,
            signal: controller.signal,
          })
        );
      } catch (error) {
        if (controller.signal.aborted || seq !== loadRequestSeq.current) return;
        const message =
          error instanceof Error ? error.message : "加载生图统计失败";
        if (!silent) {
          toast.error(message);
        } else {
          const now = Date.now();
          if (now - lastSilentErrorToastAtRef.current >= 30_000) {
            lastSilentErrorToastAtRef.current = now;
            toast.error(message);
          }
        }
      } finally {
        if (seq === loadRequestSeq.current) setIsLoading(false);
      }
    },
    [date, period]
  );

  useEffect(() => {
    if (!active || !pageVisible) return;

    let disposed = false;
    let timer: number | undefined;
    const scheduleNext = () => {
      if (!disposed) timer = window.setTimeout(() => void poll(), 5000);
    };
    const poll = async () => {
      if (disposed) return;
      if (period === "day" && date === todayInChina()) await load(true);
      scheduleNext();
    };

    void load().then(scheduleNext);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      loadAbortRef.current?.abort();
    };
  }, [active, date, load, pageVisible, period]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === "image") {
        void load(true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
  }, [load]);

  const successImages = Number(stats?.success_images) || 0;
  const failedImages = Number(stats?.failed_images) || 0;
  const totalImages = successImages + failedImages;
  const successTasks = Number(stats?.success_tasks) || 0;
  const failedTasks = Number(stats?.failed_tasks) || 0;
  const totalTasks = successTasks + failedTasks;
  const successRate =
    totalTasks > 0 ? `${((successTasks / totalTasks) * 100).toFixed(1)}%` : "—";

  return (
    <SettingsCard
      icon={BarChart3}
      title="生图任务产出统计"
      description={`统计周期：${rangeText(stats)}`}
      meta={
        <Badge
          variant="outline"
          className={cn(
            "h-5 gap-1.5 px-2 text-[11px]",
            isToday
              ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
              : "border-border/75 bg-surface-subtle text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isToday ? "bg-status-success" : "bg-muted-foreground/60"
            )}
          />
          {isToday ? "今日实时轮询" : periodLabel(period)}
        </Badge>
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as StatsPeriod)}
          >
            <SelectTrigger
              aria-label="选择统计粒度"
              className={cn("h-8 w-[104px] text-xs", settingsInputClassName)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按单日</SelectItem>
              <SelectItem value="week">按自然周</SelectItem>
              <SelectItem value="month">按自然月</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex items-center">
            <CalendarDays className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              type="date"
              aria-label="选择基准日期"
              value={date}
              onChange={(event) =>
                setDate(event.target.value || todayInChina())
              }
              className={cn(
                "h-8 w-[152px] pl-8 text-xs tabular-nums",
                settingsInputClassName
              )}
            />
          </div>

          {!isToday ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriod("day");
                setDate(todayInChina());
              }}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              回到今日
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="刷新生图统计"
            title="刷新生图统计"
            onClick={() => void load()}
            disabled={isLoading}
            className="size-8"
          >
            <RefreshCw
              className={cn("size-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>
      }
    >
      {isLoading && !stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-22 w-full" />
          <Skeleton className="h-22 w-full" />
          <Skeleton className="h-22 w-full" />
          <Skeleton className="h-22 w-full" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-foreground/75" />
              <span>总计处理图片</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {numberText(totalImages)}
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              累计调度任务 {numberText(totalTasks)} 个
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-status-success" />
              <span>成功生成图片</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {numberText(successImages)}
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              成功任务 {numberText(successTasks)} 个
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-status-danger" />
              <span>失败生成图片</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {numberText(failedImages)}
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              失败任务 {numberText(failedTasks)} 个
            </div>
          </div>

          <div className="rounded-xl border border-border/75 bg-surface-subtle/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span
                className={cn(
                  "size-2 rounded-full",
                  totalTasks === 0
                    ? "bg-muted-foreground/55"
                    : failedTasks === 0
                      ? "bg-status-success"
                      : successTasks >= failedTasks
                        ? "bg-status-warning"
                        : "bg-status-danger"
                )}
              />
              <span>任务执行成功率</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {successRate}
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {stats?.updated_at
                ? `更新于 ${new Date(stats.updated_at).toLocaleTimeString("zh-CN", { hour12: false })}`
                : "实时聚合统计"}
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
