"use client";

import { CheckSquare, Cpu, RotateCcw, Search, Square, X } from "lucide-react";

import { TaskQueueDetail } from "@/app/task-queue/task-queue-detail";
import { TaskQueuePoolPanel } from "@/app/task-queue/task-queue-pool-panel";
import { TaskQueueTable } from "@/app/task-queue/task-queue-table";
import type { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreationTask } from "@/lib/api";
import { cn } from "@/lib/utils";

type TaskQueueLiveState = ReturnType<typeof useTaskQueueLive>;

export function TaskQueueLivePanel({
  live,
  onCopyTroubleshoot,
}: {
  live: TaskQueueLiveState;
  onCopyTroubleshoot: (item: CreationTask) => Promise<void>;
}) {
  const {
    pool,
    quarantine,
    temporaryCount,
    permanentCount,
    selected,
    status,
    setStatus,
    q,
    setQ,
    onlySwitched,
    setOnlySwitched,
    pageItems,
    filteredCount,
    summary,
    executors,
    detail,
    load,
    toggleAllActive,
    setDetailId,
  } = live;

  const hasFilters = Boolean(q.trim() || status !== "all" || onlySwitched);
  const hasActiveTasks = pageItems.some(
    (item) => item.status === "running" || item.status === "queued",
  );
  const resetFilters = () => {
    setQ("");
    setStatus("all");
    setOnlySwitched(false);
  };

  const kpiCards = [
    {
      key: "all",
      label: "全部任务",
      value: summary.total,
      dotClass: "bg-foreground/75",
      valueClass: "text-foreground",
    },
    {
      key: "active",
      label: "运行 / 排队",
      value: summary.running,
      dotClass: "bg-foreground",
      valueClass: "text-foreground",
    },
    {
      key: "success",
      label: "已成功",
      value: summary.success,
      dotClass: "bg-emerald-500",
      valueClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "error",
      label: "需排错",
      value: summary.failed,
      dotClass: "bg-rose-500",
      valueClass: "text-rose-600 dark:text-rose-400",
    },
  ] as const;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_268px]">
      <div className="min-w-0 space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="任务统计">
          {kpiCards.map((card) => {
            const active = status === card.key && card.key !== "all";
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setStatus(status === card.key && card.key !== "all" ? "all" : card.key)}
                className={cn(
                  "rounded-[14px] border bg-surface p-3.5 text-left shadow-2xs transition-colors",
                  active
                    ? "border-border-strong ring-1 ring-foreground/10"
                    : "border-border/80 hover:border-border-strong/70",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", card.dotClass)} aria-hidden="true" />
                    {card.label}
                  </span>
                  {active ? (
                    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      筛选中
                    </span>
                  ) : null}
                </div>
                <div className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", card.valueClass)}>
                  {card.value}
                </div>
              </button>
            );
          })}
        </div>

        {executors ? (
          <div
            aria-label="任务执行资源"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[14px] border border-border/80 bg-surface px-4 py-2.5 text-xs shadow-2xs"
          >
            <div className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Cpu className="size-3.5 text-muted-foreground" />
              <span>Worker 并发遥测</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground tabular-nums">
              {(
                [
                  ["image", "本地号池"],
                  ["relay", "中转站"],
                  ["video", "视频 Worker"],
                ] as const
              ).map(([kind, label], idx) => {
                const lane = executors[kind];
                if (!lane) return null;
                const busy = lane.running > 0 || lane.queued > 0;
                return (
                  <div key={kind} className="inline-flex items-center gap-2">
                    {idx > 0 ? <span className="hidden h-3.5 w-px bg-border sm:inline-block" aria-hidden="true" /> : null}
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          busy ? "bg-emerald-500" : "bg-muted-foreground/45",
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">{label}</span>
                    </span>
                    <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      {lane.running}/{lane.workers} 运行
                    </span>
                    <span className="text-[11px]">
                      排队 {lane.queued}/{lane.queue_capacity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border/80 bg-surface p-2.5 shadow-2xs">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索实时任务"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索任务 ID、用户、账号或错误…"
              className="h-8 rounded-lg pr-8 pl-8 text-xs"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="实时任务状态筛选" className="h-8 w-32 rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">运行中/排队</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="error">失败</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 px-1.5 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground">
            <Checkbox
              aria-label="仅显示发生过换号的任务"
              checked={onlySwitched}
              onCheckedChange={(value) => setOnlySwitched(value === true)}
            />
            仅换号≥1
          </label>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="xs" onClick={resetFilters}>
              <RotateCcw className="size-3.5" />
              重置
            </Button>
          ) : null}
          {hasActiveTasks ? (
            <Button type="button" variant="ghost" size="xs" onClick={toggleAllActive}>
              {pageItems.some((item) => (item.status === "running" || item.status === "queued") && selected[item.id]) ? (
                <>
                  <Square className="size-3.5" />
                  清空选择
                </>
              ) : (
                <>
                  <CheckSquare className="size-3.5" />
                  选中运行中
                </>
              )}
            </Button>
          ) : null}
          <span className="ml-auto px-1 text-xs text-muted-foreground tabular-nums">
            共 {filteredCount} 条
          </span>
        </div>

        <TaskQueueTable
          live={live}
          hasFilters={hasFilters}
          onResetFilters={resetFilters}
          onCopyTroubleshoot={onCopyTroubleshoot}
        />
        {detail ? <TaskQueueDetail detail={detail} onClose={() => setDetailId(null)} /> : null}
      </div>

      <TaskQueuePoolPanel
        pool={pool}
        quarantine={quarantine}
        temporaryCount={temporaryCount}
        permanentCount={permanentCount}
        onChanged={() => void load(true)}
      />
    </div>
  );
}
