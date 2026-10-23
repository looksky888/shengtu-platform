"use client";

import { Copy, ListTodo, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { MessageCell, ProgressCell, StatusPill, TypePill } from "@/app/task-queue/task-queue-cells";
import { failureAction, formatDateTime, formatDuration } from "@/app/task-queue/task-queue-utils";
import type { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { CreationTaskCancelButton } from "@/components/creation-task-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copyText } from "@/lib/clipboard";
import type { CreationTask } from "@/lib/api";

type TaskQueueLiveState = ReturnType<typeof useTaskQueueLive>;

function compactTaskId(id: string) {
  if (!id || id.length <= 14) return id || "—";
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export function TaskQueueTable({
  live,
  hasFilters = false,
  onResetFilters,
  onCopyTroubleshoot,
}: {
  live: TaskQueueLiveState;
  hasFilters?: boolean;
  onResetFilters?: () => void;
  onCopyTroubleshoot: (item: CreationTask) => Promise<void>;
}) {
  const {
    canManageTasks,
    isLoading,
    cancellingId,
    selected,
    setSelected,
    page,
    setPage,
    pageSize,
    pageItems,
    filteredCount,
    totalPages,
    setDetailId,
    cancelOne,
  } = live;

  const handleCopyId = async (id: string) => {
    try {
      await copyText(id);
      toast.success("已复制任务 ID");
    } catch {
      toast.error("复制失败");
    }
  };

  if (isLoading && pageItems.length === 0) {
    return (
      <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-foreground" />
          正在同步实时任务队列…
        </div>
      </Card>
    );
  }

  if (pageItems.length === 0) {
    return (
      <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
        <EmptyState
          compact
          icon={hasFilters ? Search : ListTodo}
          title={hasFilters ? "没有匹配筛选条件的任务" : "暂无实时队列任务"}
          description={
            hasFilters
              ? "尝试清空搜索词或重置状态筛选条件。"
              : "当前没有正在排队或执行的任务，新创作任务触发后将在此处实时刷新。"
          }
          action={
            hasFilters && onResetFilters ? (
              <Button type="button" variant="outline" size="xs" onClick={onResetFilters}>
                <RotateCcw className="size-3.5" />
                重置筛选条件
              </Button>
            ) : undefined
          }
          className="py-12"
        />
      </Card>
    );
  }

  return (
    <Card className="max-w-full overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <div className="w-full overflow-x-auto thin-scrollbar">
        <Table>
          <TableHeader className="bg-surface-muted/45 text-[11px] font-medium tracking-wide text-muted-foreground">
            <TableRow className="border-border/75 hover:bg-transparent">
              <TableHead className="h-9 w-8 px-2.5" />
              <TableHead className="h-9 px-3">任务 ID</TableHead>
              <TableHead className="h-9 px-3">类型</TableHead>
              <TableHead className="h-9 px-3">归属</TableHead>
              <TableHead className="h-9 px-3">状态</TableHead>
              <TableHead className="h-9 px-3">阶段</TableHead>
              <TableHead className="h-9 px-3">耗时</TableHead>
              <TableHead className="h-9 px-3 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((item) => {
              const active = item.status === "running" || item.status === "queued";
              return (
                <TableRow key={item.id} className="border-border/75 transition-colors hover:bg-surface-hover/60">
                  <TableCell className="px-2.5 py-2.5 align-top">
                    <Checkbox
                      aria-label={`选择任务 ${item.id}`}
                      checked={Boolean(selected[item.id])}
                      disabled={!active}
                      onCheckedChange={(value) => setSelected((prev) => ({ ...prev, [item.id]: value === true }))}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <button
                      type="button"
                      onClick={() => void handleCopyId(item.id)}
                      title={`点击复制完整 ID：${item.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface-muted/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      <span>{compactTaskId(item.id)}</span>
                      <Copy className="size-2.5 text-muted-foreground" />
                    </button>
                    <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[144px] px-3 py-2.5 align-top">
                    <div className="space-y-1">
                      <TypePill mode={item.mode} />
                      <div className="truncate text-xs text-foreground" title={item.effective_model || item.model || ""}>
                        {item.effective_model || item.model || "—"}
                      </div>
                      <div className="truncate text-[11px] tabular-nums text-muted-foreground">
                        {item.size || "—"}
                        {item.count ? ` · ${item.count}张` : ""}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[96px] px-3 py-2.5 align-top">
                    <div className="truncate text-xs text-foreground" title={item.owner_name || item.owner_id || ""}>
                      {item.owner_name || item.owner_id || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <div className="space-y-1.5">
                      <StatusPill status={item.status} />
                      <ProgressCell item={item} />
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <MessageCell item={item} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs whitespace-nowrap tabular-nums text-foreground">
                    <div className="font-mono font-medium">{formatDuration(item)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      尝试 {typeof item.retry_index === "number" ? item.retry_index : "—"}/{typeof item.attempt_count === "number" ? item.attempt_count : "—"}
                    </div>
                    {(item.account_switch_count || 0) > 0 ? (
                      <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                        换号 {item.account_switch_count}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right align-top whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button type="button" variant="ghost" size="xs" onClick={() => setDetailId(item.id)}>
                        详情
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title="复制排错信息"
                        aria-label="复制排错信息"
                        onClick={() => void onCopyTroubleshoot(item)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      {active && canManageTasks ? (
                        <CreationTaskCancelButton
                          className="h-7 rounded-md border-transparent bg-transparent px-2 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                          loading={cancellingId === item.id}
                          label="取消"
                          onCancel={() => void cancelOne(item.id)}
                        />
                      ) : null}
                      {failureAction(item)?.label === "复制" ? (
                        <Button type="button" variant="ghost" size="xs" onClick={() => void onCopyTroubleshoot(item)}>
                          排错
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
        <span>
          共 {filteredCount} 条记录 · 第 {page} / {totalPages} 页（每页 {pageSize} 条）
        </span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            下一页
          </Button>
        </div>
      </div>
    </Card>
  );
}
