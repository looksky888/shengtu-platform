import { AlertCircle, CheckCircle2, Clock3, Download, Film, Library, Play, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { formatVideoShotTime, selectedVideoSize, videoInspirationPrompts } from "@/app/video/video-options";
import type { RecentVideoTake } from "@/app/video/video-task-storage";
import { Button } from "@/components/ui/button";
import {
  CreationTaskCancelButton,
  CreationTaskMessageState,
  CreationTaskProgressState,
} from "@/components/creation-task-state";
import type { CreationTask } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { creationTaskFailure } from "@/lib/creation-task-errors";
import { cn } from "@/lib/utils";
import { videoDownloadURL } from "@/lib/video-task-api";
import { canAccessPath } from "@/store/auth";

import type { VideoCreationController } from "./use-video-creation";

export function VideoResult({ controller }: { controller: VideoCreationController }) {
  const { task, video, pollError, selectedTake, recentTakes } = controller;
  const active = task?.status === "queued" || task?.status === "running";
  const displayedTake = !active && selectedTake?.videoUrl ? selectedTake : null;
  const frame = selectedVideoSize(displayedTake?.size || controller.size);
  const completedVideoUrl = video?.url || displayedTake?.videoUrl || "";

  return (
    <section className="relative flex min-h-[680px] flex-col overflow-hidden rounded-[24px] border border-border bg-[#fbfdff] text-foreground shadow-[0_24px_70px_-48px_rgba(15,38,74,0.35)] dark:bg-card xl:sticky xl:top-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(20,86,240,0.06),transparent_45%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.12),transparent_45%)]" />

      <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-6">
        <header className="flex min-h-10 items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1456f0] dark:text-blue-300">
              Render stage
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {active
                ? "Grok 渲染引擎工作中"
                : task?.status === "success" || displayedTake
                  ? "视频已生成"
                  : "视频预览舞台"}
            </p>
          </div>
          {active && controller.canCancelCreationTasks ? (
            <CreationTaskCancelButton
              tone="light"
              label="终止任务"
              onCancel={() => void controller.cancel()}
            />
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full bg-surface/85">
              <Link to="/video-library">
                <Library />
                视频库
              </Link>
            </Button>
          )}
        </header>

        <div className="flex flex-1 items-center justify-center py-6 sm:py-8">
          <div
            className={cn(
              "relative flex w-full items-center justify-center overflow-hidden rounded-[22px] border border-border bg-surface-subtle/85 shadow-inner dark:border-white/10 dark:bg-[#0c0e13]",
              frame.frameClass,
              frame.stageMaxClass,
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(20,86,240,0.08),transparent_52%)] dark:bg-[radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.16),transparent_52%)]" />

            {active && task ? (
              <CreationTaskProgressState
                tone="light"
                progress={task.progress ?? 0}
                indeterminate={typeof task.progress !== "number"}
                stage={task.progress_stage || (task.status === "queued" ? "正在排队" : "正在生成视频")}
                message={task.progress_message}
                taskId={task.id}
                onCopyTaskId={() => void copyTaskID(task.id)}
                className="relative z-10"
              />
            ) : null}

            {!active && pollError ? (
              <CreationTaskMessageState
                tone="light"
                icon={<AlertCircle />}
                title="任务状态读取失败"
                detail={pollError}
                className="relative z-10"
              />
            ) : null}

            {!active && !pollError && task?.status === "error" ? (
              <VideoFailureState controller={controller} task={task} />
            ) : null}

            {!active && !pollError && task?.status === "cancelled" ? (
              <CreationTaskMessageState
                tone="light"
                icon={<Clock3 />}
                title="任务已取消"
                detail="调整提示词或生成参数后可以重新提交。"
                className="relative z-10"
              />
            ) : null}

            {!active && !pollError && task?.status === "success" && !completedVideoUrl ? (
              <CreationTaskMessageState
                tone="light"
                icon={<AlertCircle />}
                title="任务完成但未找到视频"
                detail="请前往视频库检查归档结果。"
                actionLabel="打开视频库"
                actionHref="/video-library"
                className="relative z-10"
              />
            ) : null}

            {!active && !pollError && completedVideoUrl && (task?.status === "success" || displayedTake) ? (
              <SuccessResult
                controller={controller}
                videoUrl={completedVideoUrl}
                durationSeconds={task?.duration_seconds}
                take={displayedTake}
              />
            ) : null}

            {!active && !pollError && !task && !displayedTake ? (
              <EmptyResult controller={controller} frameLabel={frame.ratio} />
            ) : null}
          </div>
        </div>

        {recentTakes.length > 0 ? (
          <div className="border-t border-border/80 pt-4">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground">最近镜头记录</span>
              <Link to="/video-library" className="text-muted-foreground transition-colors hover:text-[#1456f0]">
                全部归档 →
              </Link>
            </div>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
              {recentTakes.slice(0, 6).map((take) => {
                const isSelected = controller.selectedTakeId === take.taskId;
                return (
                  <button
                    key={take.taskId}
                    type="button"
                    onClick={() => controller.selectRecentTake(take.taskId)}
                    className={cn(
                      "flex min-w-[180px] max-w-[220px] shrink-0 flex-col gap-1 rounded-[14px] border px-3 py-2 text-left transition-all",
                      isSelected
                        ? "border-blue-200 bg-blue-50/80 text-foreground dark:border-blue-500/40 dark:bg-blue-500/10"
                        : "border-border bg-surface hover:border-blue-200/80 hover:bg-surface-subtle",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {take.ratio} · {take.seconds}s
                      </span>
                      <span>{formatVideoShotTime(take.createdAt)}</span>
                    </div>
                    <p className="line-clamp-1 text-xs font-medium text-foreground">
                      {take.prompt || "未命名视频镜头"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <footer className="mt-3 flex min-h-6 items-center justify-center text-center text-[11px] text-muted-foreground">
          {active ? "离开页面不会中断任务；刷新后可继续查看生成进度" : "生成的视频会自动归档保存到视频库"}
        </footer>
      </div>
    </section>
  );
}

function EmptyResult({
  controller,
  frameLabel,
}: {
  controller: VideoCreationController;
  frameLabel: string;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-6 text-center">
      <div className="flex size-15 items-center justify-center rounded-[20px] border border-blue-200/80 bg-blue-50/80 text-[#1456f0] shadow-xs dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
        <Film className="size-6" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold text-foreground">准备生成 {frameLabel} 视频</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          在左侧设置画面描述、时长和参考图，或点选下方灵感模板快速开始
        </p>
      </div>
      <div className="mt-1 flex max-w-md flex-wrap justify-center gap-1.5">
        {videoInspirationPrompts.slice(0, 3).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => controller.applyInspirationCard(item)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-blue-200 hover:bg-blue-50/70 hover:text-[#1456f0] dark:hover:border-blue-500/35 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
          >
            <Sparkles className="size-3 text-[#1456f0] dark:text-blue-300" />
            {item.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuccessResult({
  controller,
  videoUrl,
  durationSeconds,
  take,
}: {
  controller: VideoCreationController;
  videoUrl: string;
  durationSeconds?: number;
  take: RecentVideoTake | null;
}) {
  return (
    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center bg-black">
      <video
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        className="max-h-[460px] w-full object-contain"
      />
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-zinc-950/95 px-4 py-2.5 text-xs text-zinc-200">
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          已归档至视频库
          {durationSeconds ? (
            <span className="font-mono text-[11px] text-zinc-400">· {durationSeconds.toFixed(1)}s</span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          {take ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
              onClick={() => controller.applyRecentTakePrompt(take)}
            >
              <RotateCcw className="size-3.5" />
              复用参数
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-2.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => (take ? controller.watchTakeVideo(take) : controller.watchVideo())}
          >
            <Play className="size-3.5" />
            弹窗预览
          </Button>
          <Button
            asChild
            size="sm"
            className="h-7 rounded-full bg-[#1456f0] px-3 text-xs text-white hover:bg-[#0f49cf]"
          >
            <a href={videoDownloadURL({ url: videoUrl })} download>
              <Download className="size-3.5" />
              下载
            </a>
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
  const failure = creationTaskFailure(task, controller.session);
  const allowedHref =
    failure.actionHref && canAccessPath(controller.session, failure.actionHref)
      ? failure.actionHref
      : undefined;
  const retryAction = failure.retryable && !allowedHref ? () => void controller.submit() : undefined;
  const copyAction = !failure.retryable && !allowedHref ? () => void copyTaskID(task.id) : undefined;
  return (
    <CreationTaskMessageState
      tone="light"
      icon={<AlertCircle />}
      title={failure.title}
      detail={failure.detail}
      actionLabel={failure.actionLabel}
      actionHref={allowedHref}
      onAction={retryAction || copyAction}
      actionDisabled={controller.submitting}
      className="relative z-10"
    />
  );
}

async function copyTaskID(taskID: string) {
  try {
    const copied = await copyText(taskID);
    if (copied) {
      toast.success("任务 ID 已复制");
    }
  } catch {
    toast.error("复制任务 ID 失败");
  }
}
