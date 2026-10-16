"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchImageTaskStats, type ImageTaskTodayStats } from "@/lib/api";
import { usePageVisible } from "@/lib/use-page-visible";

import { SettingsCard } from "./settings-ui";

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
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodLabel(period: StatsPeriod) {
  if (period === "week") return "本周";
  if (period === "month") return "本月";
  return "当天";
}

function rangeText(stats: ImageTaskTodayStats | null) {
  if (!stats) return "中国时间";
  const start = stats.start_date || stats.date;
  const end = stats.end_date || stats.date;
  return start === end ? `${start} 中国时间` : `${start} 至 ${end} 中国时间`;
}

export function ImageTaskStatsCard({ active = true }: { active?: boolean } = {}) {
  const [stats, setStats] = useState<ImageTaskTodayStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<StatsPeriod>("day");
  const [date, setDate] = useState(() => todayInChina());
  const lastSilentErrorToastAtRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadRequestSeq = useRef(0);
  const pageVisible = usePageVisible();

  const isToday = useMemo(() => period === "day" && date === todayInChina(), [date, period]);

  const load = useCallback(async (silent = false, nextPeriod = period, nextDate = date) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const seq = ++loadRequestSeq.current;
    if (!silent) setIsLoading(true);
    try {
      setStats(await fetchImageTaskStats({ period: nextPeriod, date: nextDate, signal: controller.signal }));
    } catch (error) {
      if (controller.signal.aborted || seq !== loadRequestSeq.current) return;
      const message = error instanceof Error ? error.message : "加载生图统计失败";
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
  }, [date, period]);

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

  return (
    <SettingsCard
      icon={BarChart3}
      title="生图统计"
      tone="blue"
      meta={<Badge variant="secondary" className="rounded-md">{isToday ? "今日实时" : periodLabel(period)}</Badge>}
      action={
        <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          刷新
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-[140px_1fr_auto]">
        <Select value={period} onValueChange={(value) => setPeriod(value as StatsPeriod)}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">按天</SelectItem>
            <SelectItem value="week">按周</SelectItem>
            <SelectItem value="month">按月</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value || todayInChina())} className="rounded-xl pl-9" />
        </div>
        <Button type="button" className="rounded-xl" onClick={() => void load()} disabled={isLoading}>查询</Button>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">统计范围：{rangeText(stats)}</div>
      {isLoading && !stats ? (
        <div className="flex min-h-28 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-status-success/25 bg-status-success-soft p-4">
            <div className="text-xs font-medium text-status-success">成功图片</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{numberText(stats?.success_images)}</div>
            <div className="mt-1 text-xs text-muted-foreground">成功任务 {numberText(stats?.success_tasks)} 个</div>
          </div>
          <div className="rounded-2xl border border-status-danger/25 bg-status-danger-soft p-4">
            <div className="text-xs font-medium text-status-danger">失败图片</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{numberText(stats?.failed_images)}</div>
            <div className="mt-1 text-xs text-muted-foreground">失败任务 {numberText(stats?.failed_tasks)} 个</div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
