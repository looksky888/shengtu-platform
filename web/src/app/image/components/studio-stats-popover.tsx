"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, ChevronUp, LoaderCircle, RefreshCw, Server, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { httpRequest } from "@/lib/request";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";

import { formatCount } from "./studio-stats-fab-utils";
import { useStudioStatsFab } from "./use-studio-stats-fab";

type StudioStatsPopoverProps = {
  variant?: "sidebar-footer" | "toolbar-pill";
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
};

export function StudioStatsPopover({
  variant = "sidebar-footer",
  align = "start",
  side = variant === "sidebar-footer" ? "top" : "bottom",
}: StudioStatsPopoverProps) {
  const fab = useStudioStatsFab();
  const pageVisible = usePageVisible();
  const [onlineAccounts, setOnlineAccounts] = useState<number | null>(null);
  const { open, setOpen, stats, loading, error, elevatedFail, hasData, rateText, setRefreshToken } = fab;

  useEffect(() => {
    if (!pageVisible) return;
    let disposed = false;
    const abortController = new AbortController();

    const loadOnlinePool = async () => {
      try {
        const health = await httpRequest<{ account_pool?: { available?: number; free_slots?: number } }>("/health", {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
          signal: abortController.signal,
        });
        if (disposed || !health?.account_pool) return;
        const pool = health.account_pool;
        const count = typeof pool.available === "number" ? pool.available : pool.free_slots;
        if (typeof count === "number" && Number.isFinite(count)) {
          setOnlineAccounts(Math.max(0, Math.floor(count)));
        }
      } catch {
        // Keep previous online account snapshot if health check transiently fails.
      }
    };

    void loadOnlinePool();
    const timer = window.setInterval(() => {
      void loadOnlinePool();
    }, 60000);

    return () => {
      disposed = true;
      abortController.abort();
      window.clearInterval(timer);
    };
  }, [pageVisible, open]);

  const todayCountLabel = loading && !hasData ? "…" : formatCount(stats.successImages);
  const onlineLabel = onlineAccounts !== null ? String(onlineAccounts) : "—";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "sidebar-footer" ? (
          <button
            type="button"
            className={cn(
              "group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] tabular-nums transition-colors",
              elevatedFail
                ? "bg-status-danger-soft/80 text-status-danger hover:bg-status-danger-soft"
                : "bg-surface-muted/75 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
            aria-label="查看今日出图与号池实时统计"
            title="点击查看今日出图成功率与号池详情"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  elevatedFail
                    ? "animate-pulse bg-status-danger"
                    : (onlineAccounts ?? 0) > 0
                      ? "bg-status-success"
                      : "bg-muted-foreground/50",
                )}
              />
              <span className="truncate">
                今日出图 <strong className="font-mono font-semibold text-foreground">{todayCountLabel}</strong>
              </span>
            </span>

            <span className="inline-flex shrink-0 items-center gap-1">
              <span>
                在线账号 <strong className="font-mono font-semibold text-foreground">{onlineLabel}</strong>
              </span>
              <ChevronUp
                className={cn(
                  "size-3 text-subtle-foreground transition-transform duration-200 group-hover:text-foreground",
                  open && "rotate-180 text-foreground",
                )}
              />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-2xs transition-colors",
              elevatedFail
                ? "border-status-danger/35 bg-status-danger-soft/80 text-status-danger hover:bg-status-danger-soft"
                : "border-border/75 bg-surface/90 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
            aria-label="查看今日出图与号池统计"
            title="点击查看今日生图统计与在线账号"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                elevatedFail
                  ? "animate-pulse bg-status-danger"
                  : (onlineAccounts ?? 0) > 0
                    ? "bg-status-success"
                    : "bg-muted-foreground/50",
              )}
            />
            <span className="hidden sm:inline">今日出图</span>
            <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
              {todayCountLabel}
            </span>
            <span className="text-border-strong">·</span>
            <span className="hidden sm:inline">在线</span>
            <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
              {onlineLabel}
            </span>
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="z-[75] w-76 rounded-2xl border-border/85 bg-surface p-3.5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/65 pb-2.5">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Activity className="size-3.5 text-muted-foreground" />
              <span>工作台实时遥测</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{stats.rangeLabel}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="rounded-md"
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading}
            title="刷新统计"
            aria-label="刷新统计"
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>

        {error && !hasData ? (
          <div className="py-4 text-center text-xs text-rose-600 dark:text-rose-400">{error}</div>
        ) : (
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-muted/75 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                  <span>成功出图</span>
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">
                  {formatCount(stats.successImages)}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  任务 {formatCount(stats.successTasks)} 个
                </div>
              </div>
              <div className="rounded-xl bg-surface-muted/75 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <XCircle className="size-3 text-rose-600 dark:text-rose-400" />
                  <span>失败图片</span>
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">
                  {formatCount(stats.failedImages)}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  任务 {formatCount(stats.failedTasks)} 个
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-surface-muted/75 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">今日成功率</span>
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {hasData ? rateText : "—"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: hasData ? `${Math.round(stats.successRate * 100)}%` : "0%" }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface-muted/60 px-2.5 py-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Server className="size-3 text-muted-foreground" />
                <span>号池在线账号</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-foreground tabular-nums">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    (onlineAccounts ?? 0) > 0 ? "bg-status-success" : "bg-muted-foreground/50",
                  )}
                />
                {onlineLabel}
              </span>
            </div>

            {stats.updatedAt ? (
              <div className="text-right font-mono text-[10px] text-subtle-foreground">
                更新于 {stats.updatedAt}
              </div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
