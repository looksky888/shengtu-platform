import { AlertCircle, CheckCircle2, Clock3, Film, Library, Maximize2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { selectedVideoSize } from "@/app/video/video-options";
import { Button } from "@/components/ui/button";
import {
  CreationTaskCancelButton,
  CreationTaskMessageState,
  CreationTaskProgressState,
} from "@/components/creation-task-state";
import type { CreationTask } from "@/lib/api";
import { creationTaskFailure } from "@/lib/creation-task-errors";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

export function VideoResult({ controller }: { controller: VideoCreationController }) {
  const { task, video, pollError } = controller;
  const frame = selectedVideoSize(controller.size);
  const active = task?.status === "queued" || task?.status === "running";
  const resolutionLabel = controller.resolutionName.toUpperCase();

  return (
    <section className="relative flex min-h-[520px] overflow-hidden rounded-2xl border border-zinc-800/90 bg-[#0b0b0d] text-zinc-100 shadow-sm xl:h-full xl:min-h-0">
      <div className="video-stage-grain pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="relative z-10 flex w-full flex-col p-4 sm:p-5">
        <header className="flex min-h-8 items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex size-2 rounded-full",
                active
                  ? "animate-pulse bg-emerald-400"
                  : task?.status === "success"
                    ? "bg-emerald-500"
                    : "bg-zinc-600",
              )}
            />
            <p className="text-sm font-medium tracking-tight text-zinc-100">
              {active
                ? "Grok 渲染引擎工作中"
                : task?.status === "success"
                  ? "视频已生成"
                  : "暗房监看画布"}
            </p>
            <span className="rounded-md border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
              {frame.ratio} · {resolutionLabel} · {controller.seconds}S
            </span>
          </div>
          {active ? (
            <CreationTaskCancelButton
              tone="dark"
              label="终止任务"
              onCancel={() => void controller.cancel()}
            />
          ) : (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 rounded-lg border-zinc-800 bg-zinc-900/80 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              <Link to="/video-library">
                <Library className="size-3.5" />
                视频库
              </Link>
            </Button>
          )}
        </header>

        <div className="relative my-3 flex min-h-0 flex-1 items-center justify-center rounded-xl border border-zinc-800/70 bg-[#0e0e11] p-5 sm:p-6">
          <span className="pointer-events-none absolute top-3.5 left-3.5 size-3 border-t border-l border-zinc-600/60" />
          <span className="pointer-events-none absolute top-3.5 right-3.5 size-3 border-t border-r border-zinc-600/60" />
          <span className="pointer-events-none absolute bottom-3.5 left-3.5 size-3 border-b border-l border-zinc-600/60" />
          <span className="pointer-events-none absolute right-3.5 bottom-3.5 size-3 border-r border-b border-zinc-600/60" />

          <div
            className={cn(
              "relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 text-zinc-100 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]",
              frame.frameClass,
              frame.ratio === "9:16"
                ? "max-w-[330px]"
                : frame.ratio === "2:3"
                  ? "max-w-[390px]"
                  : frame.ratio === "1:1"
                    ? "max-w-[520px]"
                    : "max-w-[760px]",
            )}
          >
            <span className="pointer-events-none absolute top-2.5 left-2.5 z-20 size-2.5 border-t border-l border-zinc-600/60" />
            <span className="pointer-events-none absolute top-2.5 right-2.5 z-20 size-2.5 border-t border-r border-zinc-600/60" />
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 size-2.5 border-b border-l border-zinc-600/60" />
            <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-20 size-2.5 border-r border-b border-zinc-600/60" />

            {active ? (
              <CreationTaskProgressState
                tone="dark"
                progress={task.progress ?? 0}
                indeterminate={typeof task.progress !== "number"}
                stage={
                  task.progress_stage ||
                  (task.status === "queued" ? "正在排队" : "正在生成视频")
                }
                message={task.progress_message}
                taskId={task.id}
                onCopyTaskId={() => void copyTaskID(task.id)}
                className="relative z-10"
              />
            ) : null}
            {!task && !pollError ? (
              <EmptyResult frameLabel={frame.ratio} resolutionLabel={resolutionLabel} />
            ) : null}
            {pollError ? (
              <CreationTaskMessageState
                tone="dark"
                icon={<AlertCircle />}
                title="任务状态读取失败"
                detail={pollError}
              />
            ) : null}
            {task?.status === "error" ? (
              <VideoFailureState controller={controller} task={task} />
            ) : null}
            {task?.status === "cancelled" ? (
              <CreationTaskMessageState
                tone="dark"
                icon={<Clock3 />}
                title="任务已取消"
                detail="调整提示词或生成参数后可以重新提交。"
              />
            ) : null}
            {task?.status === "success" && video?.url ? (
              <SuccessResult controller={controller} task={task} url={video.url} />
            ) : null}
            {task?.status === "success" && !video?.url ? (
              <CreationTaskMessageState
                tone="dark"
                icon={<AlertCircle />}
                title="任务完成但未找到视频"
                detail="请前往视频库检查归档结果。"
                actionLabel="打开视频库"
                actionHref="/video-library"
              />
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span className="font-mono tracking-wider uppercase">
            {frame.ratio} · {resolutionLabel} · CINEMA STAGE
          </span>
          <span>
            {active
              ? "离开页面不会中断任务；刷新后可继续查看生成进度"
              : "生成的视频会自动保存到视频库"}
          </span>
        </footer>
      </div>
    </section>
  );
}

function EmptyResult({
  frameLabel,
  resolutionLabel,
}: {
  frameLabel: string;
  resolutionLabel: string;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-3.5 px-6 text-center">
      <span className="rounded-full border border-zinc-800 bg-zinc-900/90 px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.16em] text-zinc-400 uppercase">
        {frameLabel} · {resolutionLabel} · CINEMA STAGE
      </span>
      <div className="flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 shadow-inner">
        <Film className="size-5" />
      </div>
      <div>
        <p className="text-base font-medium tracking-tight text-zinc-100">
          准备生成 {frameLabel} 视频
        </p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-400">
          在左侧设定镜头描述、时长与参考帧，点击底部生成按钮开启暗房渲染
        </p>
      </div>
    </div>
  );
}

function SuccessResult({
  controller,
  task,
  url,
}: {
  controller: VideoCreationController;
  task: CreationTask;
  url: string;
}) {
  return (
    <div className="relative z-10 flex h-full w-full flex-col justify-between bg-black">
      <video
        src={url}
        controls
        autoPlay
        muted
        loop
        playsInline
        className="h-full max-h-[60vh] w-full flex-1 object-contain"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/90 bg-zinc-950/90 px-3.5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>已自动归档至视频库</span>
          {task.duration_seconds ? (
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              · {task.duration_seconds.toFixed(1)}s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-zinc-200 hover:bg-zinc-800 hover:text-white"
            onClick={controller.watchVideo}
          >
            <Maximize2 className="size-3.5" />
            详情与下载
          </Button>
        </div>
      </div>
    </div>
  );
}

function VideoFailureState({
  controller,
  task,
}: {
  controller: VideoCreationController;
  task: CreationTask;
}) {
  const failure = creationTaskFailure(task);
  const retryAction =
    failure.retryable && !failure.actionHref
      ? () => void controller.submit()
      : undefined;
  const copyAction =
    !failure.retryable && !failure.actionHref
      ? () => void copyTaskID(task.id)
      : undefined;
  return (
    <CreationTaskMessageState
      tone="dark"
      icon={<AlertCircle />}
      title={failure.title}
      detail={failure.detail}
      actionLabel={failure.actionLabel}
      actionHref={failure.actionHref}
      onAction={retryAction || copyAction}
      actionDisabled={controller.submitting}
      className="relative z-10"
    />
  );
}

async function copyTaskID(taskID: string) {
  try {
    await navigator.clipboard.writeText(taskID);
    toast.success("任务 ID 已复制");
  } catch {
    toast.error("复制任务 ID 失败");
  }
}
