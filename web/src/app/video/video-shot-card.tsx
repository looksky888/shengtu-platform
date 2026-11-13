"use client";

import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Copy,
  CornerUpLeft,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  cameraMotionPresets,
  formatVideoShotTime,
  ratioPreviewStyle,
  selectedVideoModel,
  selectedVideoSize,
  videoInspirationPrompts,
  type VideoInspirationCard,
} from "@/app/video/video-options";
import type { RecentVideoTake } from "@/app/video/video-task-storage";
import type { VideoCreationController } from "@/app/video/use-video-creation";
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

async function copyShotTaskId(taskId: string) {
  try {
    await copyText(taskId);
    toast.success("任务 ID 已复制");
  } catch {
    toast.error("复制任务 ID 失败");
  }
}

export function VideoEmptyShowcase({
  onSelectInspiration,
  onSelectCameraChip,
}: {
  frameRatio?: string;
  resolutionLabel?: string;
  seconds?: number;
  onSelectInspiration: (card: VideoInspirationCard) => void;
  onSelectCameraChip: (descriptor: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
      {/* Quick Camera Motion Chips (aligned with /image QUICK_STYLE_CHIPS) */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {cameraMotionPresets.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onSelectCameraChip(chip.descriptor)}
            title={`向提示词追加：${chip.descriptor}`}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-surface px-2.5 text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:-translate-y-[1px] hover:border-foreground/30 hover:text-foreground active:scale-[0.98] dark:border-white/[0.06] dark:bg-[#17181c]"
          >
            <Plus className="size-3 text-subtle-foreground" aria-hidden="true" />
            <span>{chip.label}</span>
          </button>
        ))}
      </div>

      {/* Storyboard Inspiration Grid (aligned with /image darkroom inspiration plates) */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {videoInspirationPrompts.map((card, idx) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectInspiration(card)}
            className="group relative flex flex-col justify-between gap-2.5 rounded-xl border border-border/50 bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 dark:border-white/[0.06] dark:bg-[#17181c]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-white/[0.06]">
                <Sparkles className="size-3 text-foreground/70" />
                <span>{card.category}</span>
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1 rounded border border-border/75 bg-surface-muted/60 px-1.5 py-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <span
                    style={ratioPreviewStyle(card.ratio, 10)}
                    className="inline-block rounded-[1.5px] border border-current opacity-75"
                  />
                  <span>{card.ratio}</span>
                </span>
                <span className="rounded border border-border/75 bg-surface-muted/60 px-1.5 py-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  {card.seconds}s
                </span>
                <span className="text-[10px] text-subtle-foreground">0{idx + 1}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                  {card.title}
                </h2>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground group-hover:opacity-100" />
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {card.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type VideoShotCardProps = {
  take: RecentVideoTake;
  shotOrder: number;
  isHighlighted?: boolean;
  autoPlay?: boolean;
  liveTask: CreationTask | null;
  liveVideoUrl?: string;
  pollError?: string;
  controller: VideoCreationController;
};

export function VideoShotCard({
  take,
  shotOrder,
  isHighlighted = false,
  autoPlay = false,
  liveTask,
  liveVideoUrl,
  pollError,
  controller,
}: VideoShotCardProps) {
  const isLive = Boolean(liveTask && liveTask.id === take.taskId);
  const effectiveStatus = isLive && liveTask ? liveTask.status : take.status;
  const isRunning = effectiveStatus === "queued" || effectiveStatus === "running";
  const resolvedVideoUrl = (isLive ? liveVideoUrl : undefined) || take.videoUrl;
  const frame = selectedVideoSize(take.size);
  const modelSpec = selectedVideoModel(take.model);

  const statusMeta =
    effectiveStatus === "success"
      ? { label: "已完成", className: "bg-status-success-soft text-status-success" }
      : effectiveStatus === "queued"
        ? { label: "排队中", className: "bg-status-warning-soft text-status-warning" }
        : effectiveStatus === "running"
          ? { label: "生成中", className: "bg-foreground/[0.08] text-foreground" }
          : effectiveStatus === "cancelled"
            ? { label: "已取消", className: "bg-surface-muted text-muted-foreground" }
            : { label: "失败", className: "bg-status-danger-soft text-status-danger" };

  return (
    <article
      data-turn-order={shotOrder}
      data-take-id={take.taskId}
      className="mx-auto w-full max-w-[860px] space-y-3 scroll-mt-4"
    >
      {/* Shot Prompt Header Card (100% consistent with /image conversation turn prompt card) */}
      <div
        className={cn(
          "mx-auto max-w-[760px] rounded-2xl border bg-surface px-4 py-3 shadow-2xs transition-colors",
          isHighlighted
            ? "border-foreground/35 ring-2 ring-foreground/10"
            : "border-border/80",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono font-semibold text-foreground tabular-nums">
              第 {shotOrder} 镜
            </span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-muted-foreground">
              {modelSpec.shortLabel}
            </span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-muted-foreground tabular-nums">
              {frame.ratio} · {take.resolutionName.toUpperCase()} · {take.seconds}s
            </span>
            <span className={cn("rounded-md px-2 py-0.5 font-medium", statusMeta.className)}>
              {statusMeta.label}
            </span>
            {take.createdAt ? (
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatVideoShotTime(take.createdAt)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => controller.applyRecentTakePrompt(take)}
              className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
              aria-label="填入提示词与镜头参数"
              title="填入提示词与镜头参数"
            >
              <CornerUpLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void copyShotTaskId(take.taskId)}
              className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
              aria-label="复制任务 ID"
              title={`复制任务 ID: ${take.taskId}`}
            >
              <Copy className="size-3.5" />
            </button>
            {!isRunning ? (
              <button
                type="button"
                onClick={() => controller.removeTake(take.taskId)}
                className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted-foreground transition hover:border-status-danger/30 hover:bg-status-danger-soft hover:text-status-danger"
                aria-label="从列表移除该镜头"
                title="从列表移除（不影响云端视频库）"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-2.5 text-[13.5px] leading-6 whitespace-pre-wrap text-foreground/90">
          {take.prompt || "（未记录镜头提示词）"}
        </p>
      </div>

      {/* Shot Result Stage Frame */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-medium text-muted-foreground">镜头成片</span>
            <span className="rounded-md bg-surface/90 px-2 py-0.5 font-mono text-muted-foreground ring-1 ring-border/70 tabular-nums">
              {take.size}
            </span>
            <span className="rounded-md bg-surface/90 px-2 py-0.5 font-mono text-muted-foreground ring-1 ring-border/70 tabular-nums">
              {take.seconds}s
            </span>
          </div>

          {effectiveStatus === "success" && resolvedVideoUrl ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-7 rounded-lg bg-surface/95 text-xs shadow-2xs"
                onClick={() => controller.watchTakeVideo({ ...take, videoUrl: resolvedVideoUrl })}
              >
                <Maximize2 className="size-3.5" />
                <span>详情与下载</span>
              </Button>
            </div>
          ) : isRunning && controller.canCancelCreationTasks ? (
            <CreationTaskCancelButton
              tone="light"
              label="终止渲染"
              onCancel={() => void controller.cancel(take.taskId)}
            />
          ) : null}
        </div>

        <div
          className={cn(
            "relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-2xl border transition-all",
            effectiveStatus === "success" && resolvedVideoUrl
              ? "border-border/85 bg-zinc-950 shadow-sm"
              : "border-border/80 bg-surface/95 shadow-2xs",
            frame.frameClass,
            frame.stageMaxClass,
          )}
        >
          {isRunning ? (
            <CreationTaskProgressState
              tone="light"
              progress={isLive && liveTask ? (liveTask.progress ?? 0) : 0}
              indeterminate={!isLive || typeof liveTask?.progress !== "number"}
              stage={
                (isLive && liveTask?.progress_stage) ||
                (effectiveStatus === "queued" ? "正在排队分配算力" : "Grok 渲染引擎正在生成镜头")
              }
              message={isLive ? liveTask?.progress_message : "正在同步云端任务状态…"}
              taskId={take.taskId}
              onCopyTaskId={() => void copyShotTaskId(take.taskId)}
            />
          ) : effectiveStatus === "success" && resolvedVideoUrl ? (
            <div className="flex h-full w-full flex-col justify-between bg-black">
              <video
                key={resolvedVideoUrl}
                src={resolvedVideoUrl}
                controls
                autoPlay={autoPlay}
                muted={autoPlay}
                loop
                playsInline
                preload="metadata"
                className="h-full max-h-[58vh] w-full flex-1 object-contain"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-zinc-950/95 px-3.5 py-2 text-xs text-zinc-200">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>已自动归档至云端视频库</span>
                  {isLive && liveTask?.duration_seconds ? (
                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      · 耗时 {Number(liveTask.duration_seconds).toFixed(1)}s
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => controller.watchTakeVideo({ ...take, videoUrl: resolvedVideoUrl })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  <Maximize2 className="size-3" />
                  <span>全屏监看与下载</span>
                </button>
              </div>
            </div>
          ) : isLive && pollError ? (
            <CreationTaskMessageState
              tone="light"
              icon={<AlertCircle />}
              title="任务状态同步异常"
              detail={pollError}
            />
          ) : effectiveStatus === "cancelled" ? (
            <CreationTaskMessageState
              tone="light"
              icon={<Clock3 />}
              title="该镜头任务已取消"
              detail="可一键将当时的提示词与画幅参数回填至下方导演台继续创作。"
              actionLabel="回填提示词"
              actionIcon={<CornerUpLeft className="size-3.5" />}
              onAction={() => controller.applyRecentTakePrompt(take)}
            />
          ) : isLive && liveTask?.status === "error" ? (
            <LiveShotFailureState task={liveTask} controller={controller} />
          ) : (
            <CreationTaskMessageState
              tone="light"
              icon={<AlertCircle />}
              title="该镜头未生成可用视频"
              detail={take.error || "可回填原提示词调整参数重新提交，或前往视频库查看历史归档。"}
              actionLabel="回填提示词"
              actionIcon={<CornerUpLeft className="size-3.5" />}
              onAction={() => controller.applyRecentTakePrompt(take)}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function LiveShotFailureState({
  task,
  controller,
}: {
  task: CreationTask;
  controller: VideoCreationController;
}) {
  const failure = creationTaskFailure(task);
  const retryAction =
    failure.retryable && !failure.actionHref ? () => void controller.submit() : undefined;
  const copyAction =
    !failure.retryable && !failure.actionHref ? () => void copyShotTaskId(task.id) : undefined;
  return (
    <CreationTaskMessageState
      tone="light"
      icon={<AlertCircle />}
      title={failure.title}
      detail={failure.detail}
      actionLabel={failure.actionLabel}
      actionHref={failure.actionHref}
      onAction={retryAction || copyAction}
      actionDisabled={controller.submitting}
    />
  );
}
