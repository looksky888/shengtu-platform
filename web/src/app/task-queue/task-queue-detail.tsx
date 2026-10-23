"use client";

import { ChevronDown, Clock3, ListTree, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CreationTask } from "@/lib/api";
import { formatStageDuration, taskStageDurations, taskStageLabel, taskStageSections } from "@/app/task-queue/task-queue-utils";

export function TaskQueueDetail({ detail, onClose }: { detail: CreationTask; onClose: () => void }) {
  const stageDurations = taskStageDurations(detail);
  const totalStageMilliseconds = stageDurations.reduce((sum, entry) => sum + entry.milliseconds, 0);
  const primaryStage = stageDurations[0];
  const sections = taskStageSections(detail);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[90svh] w-[min(94vw,860px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[860px]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3.5 sm:px-5">
          <DialogHeader className="min-w-0 gap-1">
            <DialogTitle className="text-base text-foreground">实时状态 · 事件</DialogTitle>
            <DialogDescription className="truncate font-mono text-xs tabular-nums text-muted-foreground">{detail.id}</DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-8 shrink-0 rounded-lg px-2">
              <X className="size-4" />
              关闭
            </Button>
          </DialogClose>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-xl border border-border/80 bg-surface-muted/45 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Clock3 className="size-4 text-muted-foreground" />
              阶段耗时诊断
            </div>
            {stageDurations.length ? (
              <>
                <div className="mt-2 grid gap-2 text-xs tabular-nums text-muted-foreground sm:grid-cols-3">
                  <div>阶段合计：<span className="font-semibold text-foreground">{formatStageDuration(totalStageMilliseconds)}</span></div>
                  <div>主要耗时：<span className="font-semibold text-foreground">{taskStageLabel(primaryStage.stage)}</span></div>
                  <div>任务总耗时：<span className="font-semibold text-foreground">{formatDurationValue(detail.duration_seconds)}</span></div>
                </div>
                <div className="mt-3 space-y-2">
                  {sections.map((section) => {
                    const ratio = totalStageMilliseconds > 0 ? Math.max(3, Math.round((section.milliseconds / totalStageMilliseconds) * 100)) : 0;
                    return (
                      <div key={section.key} className="rounded-lg border border-border/70 bg-surface px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-foreground">{section.label}</span>
                          <span className="font-mono tabular-nums text-foreground">
                            {section.rawStages.length ? formatStageDuration(section.milliseconds) : "未执行"}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-surface-muted">
                          <span className="block h-full rounded-sm bg-foreground" style={{ width: `${section.milliseconds > 0 ? ratio : section.rawStages.length ? 3 : 0}%` }} />
                        </div>
                        {section.rawStages.length > 1 ? <div className="mt-1 text-[11px] text-muted-foreground">{section.rawStages.map(taskStageLabel).join("、")}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">旧任务或未完成任务暂无阶段耗时记录</p>
            )}
          </div>
          <div className="grid gap-2 rounded-xl border border-border/70 bg-surface-muted/35 p-3 text-xs tabular-nums text-muted-foreground sm:grid-cols-2">
            <div>生效 provider：<span className="font-medium text-foreground">{detail.effective_provider || "—"}</span></div>
            <div>生效通道：<span className="font-medium text-foreground">{detail.effective_channel || "—"}</span></div>
            <div>配置来源：<span className="font-medium text-foreground">{detail.provider_source || "—"}</span></div>
            <div>上游模型：<span className="font-medium text-foreground">{detail.effective_model || detail.model || "—"}</span></div>
            <div>上游主机：<span className="font-medium text-foreground">{detail.upstream_host || "—"}</span></div>
            <div>HTTP：<span className="font-mono font-medium text-foreground">{detail.upstream_http_status || "—"}</span></div>
            <div>重试：<span className="font-mono font-medium text-foreground">{typeof detail.retry_index === "number" ? detail.retry_index : "—"} / {typeof detail.attempt_count === "number" ? detail.attempt_count : "—"}</span></div>
            <div>Request ID：<span className="font-mono font-medium text-foreground">{detail.upstream_request_id || "—"}</span></div>
            <div>CF-Ray：<span className="font-mono font-medium text-foreground">{detail.upstream_cf_ray || "—"}</span></div>
          </div>
          <details className="group rounded-xl border border-border/80 bg-surface-muted/35">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 tabular-nums"><ListTree className="size-4 text-muted-foreground" />步骤明细（{detail.events?.length || 0} 条事件）</span>
              <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            {!detail.events?.length ? (
              <p className="border-t border-border/70 px-3 py-3 text-xs text-muted-foreground">暂无事件时间线</p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto border-t border-border/70 px-3 py-2 text-xs">
                {detail.events.map((event, index) => (
                  <div key={`${event.time}-${index}`} className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 rounded-md border border-border/60 bg-surface px-2 py-1.5">
                    <span className="font-mono tabular-nums text-muted-foreground">{event.time || "—"}</span>
                    <span className="text-muted-foreground">[{event.stage || "—"}]</span>
                    <span className="min-w-0 text-foreground">{event.message || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </details>
          {detail.error || detail.troubleshooting ? (
            <details className="group rounded-xl border border-rose-500/25 bg-rose-500/10">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300 [&::-webkit-details-marker]:hidden">
                <span>错误详情</span><ChevronDown className="size-4 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-rose-500/20 px-3 py-3 text-xs text-rose-800 dark:text-rose-200">
                {detail.error ? <div><span className="font-medium">错误：</span>{detail.error}</div> : null}
                {detail.troubleshooting ? <div><span className="font-medium">建议：</span>{detail.troubleshooting}</div> : null}
              </div>
            </details>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDurationValue(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "未记录";
  return `${seconds.toFixed(1)} s`;
}
