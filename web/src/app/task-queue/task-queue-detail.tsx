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
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-4 py-3 sm:px-5">
          <DialogHeader className="min-w-0 gap-1">
            <DialogTitle className="text-base text-stone-800">实时状态 · 事件</DialogTitle>
            <DialogDescription className="truncate font-mono text-xs text-stone-500">{detail.id}</DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-8 shrink-0 rounded-lg px-2">
              <X className="size-4" />
              关闭
            </Button>
          </DialogClose>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-400/20 dark:bg-blue-400/[0.08]">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-800 dark:text-blue-200"><Clock3 className="size-4" />阶段耗时诊断</div>
          {stageDurations.length ? (
            <>
              <div className="mt-2 grid gap-2 text-xs text-blue-900/75 dark:text-blue-100/80 sm:grid-cols-3">
                <div>阶段合计：<span className="font-semibold">{formatStageDuration(totalStageMilliseconds)}</span></div>
                <div>主要耗时：<span className="font-semibold">{taskStageLabel(primaryStage.stage)}</span></div>
                <div>任务总耗时：<span className="font-semibold">{formatDurationValue(detail.duration_seconds)}</span></div>
              </div>
              <div className="mt-3 space-y-2">
                {sections.map((section) => {
                  const ratio = totalStageMilliseconds > 0 ? Math.max(3, Math.round((section.milliseconds / totalStageMilliseconds) * 100)) : 0;
                  return (
                    <div key={section.key} className="rounded-lg border border-blue-100/80 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-stone-700 dark:text-stone-200">{section.label}</span>
                        <span className="font-mono tabular-nums text-stone-800 dark:text-stone-100">
                          {section.rawStages.length ? formatStageDuration(section.milliseconds) : "未执行"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100/70 dark:bg-white/10">
                        <span className="block h-full rounded-full bg-blue-500/80" style={{ width: `${section.milliseconds > 0 ? ratio : section.rawStages.length ? 3 : 0}%` }} />
                      </div>
                      {section.rawStages.length > 1 ? <div className="mt-1 text-[11px] text-stone-400">{section.rawStages.map(taskStageLabel).join("、")}</div> : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p className="mt-2 text-xs text-blue-900/65 dark:text-blue-100/70">旧任务或未完成任务暂无阶段耗时记录</p>}
        </div>
        <div className="grid gap-2 rounded-md border border-stone-100 bg-stone-50/70 p-3 text-xs text-stone-600 sm:grid-cols-2">
          <div>生效 provider：<span className="font-medium text-stone-800">{detail.effective_provider || "—"}</span></div>
          <div>生效通道：<span className="font-medium text-stone-800">{detail.effective_channel || "—"}</span></div>
          <div>配置来源：<span className="font-medium text-stone-800">{detail.provider_source || "—"}</span></div>
          <div>上游模型：<span className="font-medium text-stone-800">{detail.effective_model || detail.model || "—"}</span></div>
          <div>上游主机：<span className="font-medium text-stone-800">{detail.upstream_host || "—"}</span></div>
          <div>HTTP：<span className="font-medium text-stone-800">{detail.upstream_http_status || "—"}</span></div>
          <div>重试：<span className="font-medium text-stone-800">{typeof detail.retry_index === "number" ? detail.retry_index : "—"} / {typeof detail.attempt_count === "number" ? detail.attempt_count : "—"}</span></div>
          <div>Request ID：<span className="font-mono font-medium text-stone-800">{detail.upstream_request_id || "—"}</span></div>
          <div>CF-Ray：<span className="font-mono font-medium text-stone-800">{detail.upstream_cf_ray || "—"}</span></div>
        </div>
        <details className="group rounded-xl border border-stone-200/80 bg-stone-50/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><ListTree className="size-4 text-stone-500" />步骤明细（{detail.events?.length || 0} 条事件）</span>
            <ChevronDown className="size-4 text-stone-400 transition group-open:rotate-180" />
          </summary>
          {!detail.events?.length ? (
            <p className="border-t border-stone-200/70 px-3 py-3 text-xs text-stone-400">暂无事件时间线</p>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto border-t border-stone-200/70 px-3 py-2 text-xs">
              {detail.events.map((event, index) => (
                <div key={`${event.time}-${index}`} className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 rounded-md border border-stone-100 bg-white px-2 py-1.5">
                  <span className="font-mono tabular-nums text-stone-400">{event.time || "—"}</span>
                  <span className="text-stone-500">[{event.stage || "—"}]</span>
                  <span className="min-w-0 text-stone-700">{event.message || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </details>
        {detail.error || detail.troubleshooting ? (
          <details className="group rounded-xl border border-rose-200/80 bg-rose-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-rose-700 [&::-webkit-details-marker]:hidden">
              <span>错误详情</span><ChevronDown className="size-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-rose-200/70 px-3 py-3 text-xs text-rose-800">
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
