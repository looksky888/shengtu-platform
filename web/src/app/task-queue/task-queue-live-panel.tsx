"use client";

import { CheckSquare, Square } from "lucide-react";

import { TaskQueueDetail } from "@/app/task-queue/task-queue-detail";
import { TaskQueuePoolPanel } from "@/app/task-queue/task-queue-pool-panel";
import { TaskQueueTable } from "@/app/task-queue/task-queue-table";
import type { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreationTask } from "@/lib/api";

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
    summary,
    executors,
    detail,
    load,
    toggleAllActive,
    setDetailId,
  } = live;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-4" aria-label="任务统计">
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs"><div className="text-xs font-medium text-muted-foreground">全部任务</div><div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{summary.total}</div></div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs"><div className="text-xs font-medium text-muted-foreground">运行中</div><div className="mt-1.5 text-2xl font-semibold tracking-tight text-primary tabular-nums">{summary.running}</div></div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs"><div className="text-xs font-medium text-muted-foreground">已成功</div><div className="mt-1.5 text-2xl font-semibold tracking-tight text-emerald-600 tabular-nums">{summary.success}</div></div>
          <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs"><div className="text-xs font-medium text-muted-foreground">需排错</div><div className="mt-1.5 text-2xl font-semibold tracking-tight text-rose-600 tabular-nums">{summary.failed}</div></div>
        </div>

        {executors ? (
          <div className="grid gap-2.5 sm:grid-cols-3" aria-label="任务执行资源">
            {([['image', '本地号池图片'], ['relay', '中转站图片'], ['video', '视频执行资源']] as const).map(([kind, label]) => {
              const lane = executors[kind];
              if (!lane) return null;
              return <div key={kind} className="rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-xs text-muted-foreground shadow-2xs">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground">{label}</span><span className="tabular-nums">{lane.running} 运行 · {lane.queued} 排队</span></div>
                <div className="mt-1 text-muted-foreground">Worker {lane.workers} · 等待上限 {lane.queue_capacity}</div>
              </div>;
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="实时任务状态筛选" className="h-9 w-[150px] rounded-lg">
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
          <Input
            aria-label="搜索实时任务"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索任务 ID / 用户 / 账号 / 错误"
            className="h-9 max-w-xs rounded-lg"
          />
          <label className="inline-flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Checkbox aria-label="仅显示发生过换号的任务" checked={onlySwitched} onCheckedChange={(value) => setOnlySwitched(value === true)} />
            仅换号≥1
          </label>
          <Button type="button" variant="ghost" className="h-9 rounded-lg text-xs" onClick={toggleAllActive}>
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
        </div>

        <TaskQueueTable live={live} onCopyTroubleshoot={onCopyTroubleshoot} />
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
