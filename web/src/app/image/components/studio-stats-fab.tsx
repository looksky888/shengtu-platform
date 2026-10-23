"use client";

import { Activity, CheckCircle2, LoaderCircle, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { formatCount } from "./studio-stats-fab-utils";
import { useStudioStatsFab } from "./use-studio-stats-fab";

export function StudioStatsFab() {
  const fab = useStudioStatsFab();
  if (!fab.ready) return null;

  const { open, setOpen, stats, loading, error, elevatedFail, hasData, rateText, setRefreshToken } = fab;

  return (
    <div className="fixed top-17 right-4 z-30 hidden sm:right-6 lg:block">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium shadow-2xs backdrop-blur-md transition-colors",
              elevatedFail
                ? "border-rose-300/70 bg-rose-50/90 text-rose-700 hover:bg-rose-100/90 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300"
                : "border-border/75 bg-surface/90 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
            aria-label="查看今日生图统计"
            title="今日生图实时统计"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                elevatedFail ? "bg-rose-500 animate-pulse" : hasData ? "bg-emerald-500" : "bg-muted-foreground/50",
              )}
            />
            <Activity className="size-3.5 text-muted-foreground" />
            <span>今日生图</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {loading && !hasData ? "…" : hasData ? `${formatCount(stats.successImages)}张 · ${rateText}` : "0张"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-76 rounded-xl border-border/85 bg-surface p-3.5 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Activity className="size-3.5 text-muted-foreground" />
                <span>今日生图统计</span>
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
            >
              {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </div>

          {error && !hasData ? (
            <div className="py-4 text-center text-xs text-rose-600 dark:text-rose-400">{error}</div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                    <span>成功图片</span>
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                    {formatCount(stats.successImages)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    任务 {formatCount(stats.successTasks)} 个
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <XCircle className="size-3 text-rose-600 dark:text-rose-400" />
                    <span>失败图片</span>
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                    {formatCount(stats.failedImages)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    任务 {formatCount(stats.failedTasks)} 个
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">今日成功率</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {hasData ? rateText : "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: hasData ? `${Math.round(stats.successRate * 100)}%` : "0%" }}
                  />
                </div>
              </div>

              {stats.updatedAt ? (
                <div className="text-right text-[10px] text-muted-foreground">
                  更新于 {stats.updatedAt}
                </div>
              ) : null}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
