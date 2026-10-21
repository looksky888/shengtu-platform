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

  return (
    <section className="relative flex min-h-[660px] overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs xl:sticky xl:top-18">
      <div className="relative z-10 flex w-full flex-col p-4 sm:p-5">
        <header className="flex min-h-9 items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-2 rounded-full bg-primary" />
            <p className="text-sm font-semibold text-foreground">
              {active
                ? "Grok 渲染引擎工作中"
                : task?.status === "success"
                  ? "视频已生成"
                  : "视频预览画布"}
            </p>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {frame.ratio}
            </span>
          </div>
          {active ? (
            <CreationTaskCancelButton
              tone="light"
              label="终止任务"
              onCancel={() => void controller.cancel()}
            />
          ) : (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/video-library">
                <Library className="size-3.5" />
                视频库
              </Link>
            </Button>
          )}
        </header>

        <div className="flex flex-1 items-center justify-center rounded-lg bg-muted/25 p-4 sm:p-6 my-3 border border-border/50">
          <div
            className={cn(
              "relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-white shadow-sm",
              frame.frameClass,
              frame.ratio === "9:16"
                ? "max-w-[330px]"
                : frame.ratio === "1:1"
                  ? "max-w-[520px]"
                  : "max-w-[760px]",
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(20,86,240,0.16),transparent_60%)]" />
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
            {!task && !pollError ? <EmptyResult frameLabel={frame.ratio} /> : null}
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

        <footer className="flex items-center justify-center text-center text-[11px] text-muted-foreground">
          {active
            ? "离开页面不会中断任务；刷新后可继续查看生成进度"
            : "生成的视频会自动保存到视频库"}
        </footer>
      </div>
    </section>
  );
}

function EmptyResult({ frameLabel }: { frameLabel: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-3.5 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-blue-400">
        <Film className="size-5" />
      </div>
      <div>
        <p className="text-base font-medium text-white/90">准备生成 {frameLabel} 视频</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-white/50">
          在左侧设置画面描述、时长和首帧参考，点击底部按钮开始生成
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
    <div className="relative z-10 flex h-full w-full flex-col justify-between bg-black/90">
      <video
        src={url}
        controls
        autoPlay
        muted
        loop
        playsInline
        className="h-full max-h-[60vh] w-full flex-1 object-contain"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/75 px-3.5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>已自动归档至视频库</span>
          {task.duration_seconds ? (
            <span className="font-mono text-[11px] text-white/45">
              · {task.duration_seconds.toFixed(1)}s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-white/80 hover:bg-white/15 hover:text-white"
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
