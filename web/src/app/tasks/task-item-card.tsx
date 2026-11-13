import {
  AlertCircle,
  Ban,
  Copy,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquare,
  Play,
} from "lucide-react";

import type { LightboxImage } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import type { VideoPreview } from "@/components/video-preview-dialog";
import type { CreationTask } from "@/lib/api-types";
import { cn } from "@/lib/utils";

import {
  formatTaskModeLabel,
  isTaskActive,
  resolveTaskStatusBadge,
} from "./task-helpers";

export type LocalTaskMeta = {
  prompt?: string;
  mediaUrl?: string;
};

type TaskItemCardProps = {
  task: CreationTask;
  localMeta?: LocalTaskMeta;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: (taskId: string) => void;
  onCopyPrompt: (prompt: string) => void;
  onPreviewVideo: (preview: { preview: VideoPreview; downloadName: string }) => void;
  onPreviewImage: (image: LightboxImage) => void;
};

export function TaskItemCard({
  task,
  localMeta,
  canCancel,
  cancelling,
  onCancel,
  onCopyPrompt,
  onPreviewVideo,
  onPreviewImage,
}: TaskItemCardProps) {
  const badge = resolveTaskStatusBadge(task.status);
  const active = isTaskActive(task.status);
  const firstOutput = task.data?.[0];
  const mediaUrl =
    firstOutput?.url ||
    (firstOutput?.b64_json
      ? `data:image/png;base64,${firstOutput.b64_json}`
      : localMeta?.mediaUrl);
  const promptText =
    localMeta?.prompt ||
    firstOutput?.revised_prompt ||
    firstOutput?.text_response ||
    "";
  const modelName = task.effective_model || task.model || "auto";
  const modeLabel = formatTaskModeLabel(task);
  const progressPct =
    typeof task.progress === "number" && Number.isFinite(task.progress)
      ? Math.max(4, Math.min(99, Math.round(task.progress)))
      : task.status === "running"
        ? 48
        : 12;

  return (
    <article className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-surface p-3.5 transition-colors hover:border-border-strong/75 sm:flex-row sm:items-center dark:border-white/[0.06] dark:bg-[#17181c]">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        {/* Thumbnail Preview */}
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
          {mediaUrl && task.mode === "video" ? (
            <button
              type="button"
              onClick={() =>
                onPreviewVideo({
                  preview: {
                    url: mediaUrl,
                    prompt: promptText || undefined,
                    seconds: firstOutput?.seconds,
                    resolution: firstOutput?.resolution,
                    size: task.size,
                  },
                  downloadName: `video-${task.id}.mp4`,
                })
              }
              className="relative block h-full w-full bg-zinc-950"
              aria-label="预览生成视频"
            >
              <video
                src={mediaUrl}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                <Play className="size-4 fill-current" />
              </span>
            </button>
          ) : mediaUrl && task.mode !== "chat" ? (
            <button
              type="button"
              onClick={() =>
                onPreviewImage({
                  id: task.id,
                  src: mediaUrl,
                  downloadName: `image-${task.id}.png`,
                })
              }
              className="block h-full w-full cursor-zoom-in"
              aria-label="预览生成图片"
            >
              <img
                src={mediaUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              {active ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : task.mode === "video" ? (
                <Film className="size-5" />
              ) : task.mode === "chat" ? (
                <MessageSquare className="size-5" />
              ) : (
                <ImageIcon className="size-5" />
              )}
            </div>
          )}
        </div>

        {/* Metadata & Prompt */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                badge.pillClass,
              )}
            >
              <span className={cn("size-1.5 rounded-full", badge.dotClass)} />
              <span>{badge.label}</span>
            </span>

            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
              {modeLabel}
            </span>

            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {modelName}
            </span>

            {task.size ? (
              <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                {task.size}
              </span>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-xs leading-5 text-foreground/90">
              {promptText || `任务编号 #${task.id}`}
            </p>
            {promptText ? (
              <button
                type="button"
                onClick={() => onCopyPrompt(promptText)}
                title="复制提示词"
                aria-label="复制提示词"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Copy className="size-3.5" />
              </button>
            ) : null}
          </div>

          {active ? (
            <div className="space-y-1 pt-0.5">
              <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {task.progress_message ||
                  task.progress_stage ||
                  (task.status === "queued"
                    ? "正在等待可用生成通道…"
                    : "正在渲染输出…")}
              </p>
            </div>
          ) : null}

          {task.error ? (
            <p className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2">{task.error}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px] text-muted-foreground tabular-nums">
            <span>创建于 {task.created_at}</span>
            {typeof task.duration_seconds === "number" &&
            task.duration_seconds > 0 ? (
              <span>耗时 {task.duration_seconds.toFixed(1)}s</span>
            ) : null}
            <span className="truncate opacity-75">ID: {task.id}</span>
          </div>
        </div>
      </div>

      {/* Right Action Column */}
      {active && canCancel ? (
        <div className="flex shrink-0 items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancelling}
            onClick={() => onCancel(task.id)}
            className="h-8 text-xs text-rose-600 hover:text-rose-600 dark:text-rose-400"
          >
            {cancelling ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Ban className="size-3.5" />
            )}
            <span>取消任务</span>
          </Button>
        </div>
      ) : null}
    </article>
  );
}
