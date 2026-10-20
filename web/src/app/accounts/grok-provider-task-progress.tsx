import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Circle, Download, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { GrokProviderConversionTask } from "@/lib/grok-provider-accounts-api";
import { downloadBlob } from "@/lib/image-download";

const OPERATION_LABELS: Record<GrokProviderConversionTask["operation"], string> = {
  convert: "账号转换", import: "账号导入", status: "状态更新", concurrency: "并发配置",
  egress: "出口配置", quota: "额度同步", detect: "账号检测",
};

const STAGE_LABELS: Record<string, { title: string; detail: string }> = {
  import: { title: "验证并导入", detail: "解析凭据并加密入库" },
  provider_quota: { title: "同步账号额度", detail: "刷新本次导入账号" },
  console_conversion: { title: "转换 Console", detail: "建立 Web 与 Console 关联" },
  console_quota: { title: "同步 Console 额度", detail: "刷新图片与视频额度" },
};

function resultSummary(task: GrokProviderConversionTask): string {
  const values = [
    ["新增", task.result.created], ["更新", task.result.updated], ["成功", task.result.succeeded],
    ["跳过", task.result.skipped], ["无效", task.result.invalid], ["需检查", task.result.failed],
  ].filter((item): item is [string, number] => typeof item[1] === "number" && item[1] > 0);
  return values.map(([label, value]) => `${label} ${value}`).join(" · ");
}

export function GrokProviderTaskProgress({ task }: { task: GrokProviderConversionTask }) {
  const [open, setOpen] = useState(false);
  const running = task.status === "queued" || task.status === "running";
  const failed = task.status === "failed";
  const stages = task.stages?.length ? task.stages : [{ key: task.operation, status: task.status, ...task.progress }];
  const foundActive = stages.findIndex((stage) => stage.status === "running" || stage.status === "failed");
  const activeIndex = foundActive < 0 ? Math.max(0, stages.length - 1) : foundActive;
  const finishedStages = stages.filter((stage) => stage.status === "succeeded").length;
  const calculatedPercent = failed ? task.progress.percent : running
    ? Math.round(((finishedStages + (stages[activeIndex]?.percent || 0) / 100) / stages.length) * 100)
    : 100;
  const overallPercent = Math.min(100, Math.max(0, calculatedPercent));
  const summary = resultSummary(task);
  const failureCode = task.error?.code || task.result.failures?.[0]?.code;
  const operationLabel = OPERATION_LABELS[task.operation];
  const statusLabel = running ? "进行中" : failed ? "未完成" : "已完成";

  useEffect(() => setOpen(true), [task.id]);

  const downloadResult = () => {
    const payload = { task_id: task.id, operation: task.operation, target: task.target, status: task.status, result: task.result, error: task.error, created_at: task.created_at, started_at: task.started_at, finished_at: task.finished_at };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `grok-provider-task-${task.id}.json`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={failed ? "border-rose-200 text-rose-700" : running ? "border-[#1456f0]/25 text-[#1456f0]" : "border-emerald-200 text-emerald-700"}
        >
          {failed ? <AlertCircle /> : running ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <CheckCircle2 />}
          <span>{operationLabel}</span>
          <span className="font-mono text-xs tabular-nums">{overallPercent}%</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(88dvh,720px)] gap-0 overflow-y-auto p-0 sm:w-[min(92vw,680px)]">
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 sm:px-6">
          <div className="flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${failed ? "bg-rose-50 text-rose-600" : running ? "bg-blue-50 text-[#1456f0]" : "bg-emerald-50 text-emerald-600"}`}>
              {failed ? <AlertCircle className="size-5" /> : running ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="size-5" />}
            </span>
            <div className="min-w-0">
              <DialogTitle>{operationLabel}{statusLabel}</DialogTitle>
              <DialogDescription className="mt-1">{running ? "可随时收起，不影响账号选择和批量操作。" : summary || "任务结果已写入账号中心。"}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div aria-live="polite">
            <div className="mb-2 flex items-end justify-between gap-4">
              <div><p className="text-sm font-semibold">总体进度</p><p className="mt-0.5 text-xs text-muted-foreground">{finishedStages}/{stages.length} 个阶段完成</p></div>
              <span className={`font-mono text-2xl font-semibold tabular-nums ${failed ? "text-rose-600" : "text-[#1456f0]"}`}>{overallPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${failed ? "bg-rose-500" : running ? "bg-[#1456f0]" : "bg-emerald-600"}`} style={{ width: `${overallPercent}%` }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {stages.map((stage, index) => {
              const meta = STAGE_LABELS[stage.key] || { title: operationLabel, detail: "正在处理账号数据" };
              const isRunning = stage.status === "running";
              const isFailed = stage.status === "failed";
              const isDone = stage.status === "succeeded";
              const stagePercent = Math.min(100, Math.max(0, stage.percent || 0));
              return (
                <div key={`${stage.key}-${index}`} className={`relative min-w-0 overflow-hidden rounded-2xl border p-4 ${isRunning ? "border-[#1456f0]/30 bg-blue-50/60" : isFailed ? "border-rose-200 bg-rose-50/60" : isDone ? "border-emerald-200/80 bg-emerald-50/50" : "border-border/70 bg-muted/20"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${isDone ? "bg-emerald-600 text-white" : isRunning ? "bg-[#1456f0] text-white" : isFailed ? "bg-rose-600 text-white" : "border border-border bg-white text-muted-foreground"}`}>
                      {isDone ? <Check className="size-3.5" /> : isRunning ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : isFailed ? <AlertCircle className="size-3.5" /> : <Circle className="size-2 fill-current" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{meta.title}</span>{isRunning ? <span className="font-mono text-xs tabular-nums text-[#1456f0]">{stagePercent}%</span> : null}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{meta.detail}</p>
                      {(isRunning || isFailed) && stage.total > 0 ? <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">{stage.completed} / {stage.total}</p> : null}
                    </div>
                  </div>
                  {isRunning ? <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-100"><div className="h-full bg-[#1456f0] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${stagePercent}%` }} /></div> : null}
                </div>
              );
            })}
          </div>

          {failed ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">失败码：<span className="font-mono text-xs">{failureCode || "provider_task_failed"}</span></div> : null}
        </div>

        <DialogFooter className="border-t border-border/70 px-5 py-4 sm:px-6">
          {!running ? <Button variant="outline" onClick={downloadResult}><Download className="size-4" />下载任务结果</Button> : null}
          <DialogClose asChild><Button variant={running ? "outline" : "default"}>{running ? "收起" : "关闭"}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
