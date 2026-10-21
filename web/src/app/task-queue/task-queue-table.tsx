"use client";

import { Copy } from "lucide-react";

import { MessageCell, ProgressCell, StatusPill, TypePill } from "@/app/task-queue/task-queue-cells";
import { failureAction, formatDateTime, formatDuration } from "@/app/task-queue/task-queue-utils";
import type { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { CreationTaskCancelButton } from "@/components/creation-task-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreationTask } from "@/lib/api";

type TaskQueueLiveState = ReturnType<typeof useTaskQueueLive>;

export function TaskQueueTable({
  live,
  onCopyTroubleshoot,
}: {
  live: TaskQueueLiveState;
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

  return (
    <Card className="max-w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead className="h-9 w-10 bg-muted/40" />
              <TableHead className="h-9 min-w-[200px] bg-muted/40 text-xs font-medium text-muted-foreground">任务 ID</TableHead>
              <TableHead className="h-9 min-w-[190px] bg-muted/40 text-xs font-medium text-muted-foreground">类型 / 模型</TableHead>
              <TableHead className="h-9 min-w-[190px] bg-muted/40 text-xs font-medium text-muted-foreground">状态 / 进度</TableHead>
              <TableHead className="h-9 min-w-[220px] bg-muted/40 text-xs font-medium text-muted-foreground">阶段 / 账号</TableHead>
              <TableHead className="h-9 min-w-[150px] bg-muted/40 text-xs font-medium text-muted-foreground">耗时 / 尝试</TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium text-muted-foreground">时间</TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium text-muted-foreground">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  暂无任务
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((item) => {
                const active = item.status === "running" || item.status === "queued";
                return (
                  <TableRow key={item.id} className="border-border/70">
                    <TableCell className="align-top">
                      <Checkbox
                        aria-label={`选择任务 ${item.id}`}
                        checked={Boolean(selected[item.id])}
                        disabled={!active}
                        onCheckedChange={(value) => setSelected((prev) => ({ ...prev, [item.id]: value === true }))}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-mono text-xs text-foreground">{item.id}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{item.owner_name || item.owner_id || "—"}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1.5">
                        <TypePill mode={item.mode} />
                        <div className="truncate text-xs text-foreground">{item.effective_model || item.model || "—"}</div>
                        <div className="text-xs text-muted-foreground">{item.size || "—"}{item.count ? ` · ${item.count} 张` : ""}</div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1.5">
                        <StatusPill status={item.status} />
                        <ProgressCell item={item} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <MessageCell item={item} />
                    </TableCell>
                    <TableCell className="align-top text-xs text-foreground">
                      <div className="font-mono tabular-nums">{formatDuration(item)}</div>
                      <div className="mt-1 text-muted-foreground">
                        重试 {typeof item.retry_index === "number" ? item.retry_index : "—"} / {typeof item.attempt_count === "number" ? item.attempt_count : "—"}
                      </div>
                      {(item.account_switch_count || 0) > 0 ? <div className="mt-1 text-amber-600">换号 {item.account_switch_count}</div> : null}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="ghost" className="h-8 rounded-lg px-2 text-xs" onClick={() => setDetailId(item.id)}>
                          实时状态
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 rounded-lg px-2 text-xs"
                          title="复制排错"
                          onClick={() => void onCopyTroubleshoot(item)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {active && canManageTasks ? (
                          <CreationTaskCancelButton
                            className="h-8 rounded-lg border-transparent bg-transparent px-2 text-xs text-rose-600 hover:bg-rose-50"
                            loading={cancellingId === item.id}
                            label="取消"
                            onCancel={() => void cancelOne(item.id)}
                          />
                        ) : null}
                        {failureAction(item)?.label === "复制" ? (
                          <Button type="button" variant="ghost" className="h-8 rounded-lg px-2 text-xs" onClick={() => void onCopyTroubleshoot(item)}>
                            排错
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <span>
          每页 {pageSize} 条，共 {filteredCount} 条；第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-8 rounded-lg" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg"
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
