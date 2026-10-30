import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CornerUpLeft,
  Film,
  Library,
  LoaderCircle,
  Maximize2,
  Play,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { selectedVideoSize } from "@/app/video/video-options";
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

import type { VideoCreationController } from "./use-video-creation";

const CAMERA_MOTION_CHIPS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "+ 电影感推轨特写", value: "缓慢推轨镜头特写，细腻光学浅景深与胶片质感" },
  { label: "+ 无人机环绕航拍", value: "平稳航拍环绕运镜，宏大空间纵深与自然体积光" },
  { label: "+ 35mm 手持跟拍", value: "35mm 电影镜头手持纪实跟拍，真实呼吸感运动节奏" },
  { label: "+ 高速微距慢动作", value: "高速摄影慢动作微距捕捉，清晰流体与材质光影细节" },
];

export function VideoResult({ controller }: { controller: VideoCreationController }) {
  const { task, video, pollError, selectedTake, recentTakes } = controller;
  const active = task?.status === "queued" || task?.status === "running";
  const inspectingHistory = Boolean(selectedTake && selectedTake.taskId !== task?.id);

  const stageSize = inspectingHistory && selectedTake ? selectedTake.size : controller.size;
  const stageSeconds = inspectingHistory && selectedTake ? selectedTake.seconds : controller.seconds;
  const stageResolutionLabel = (
    inspectingHistory && selectedTake ? selectedTake.resolutionName : controller.resolutionName
  ).toUpperCase();
  const frame = selectedVideoSize(stageSize);

  const activeStageTakeId = inspectingHistory && selectedTake
    ? selectedTake.taskId
    : task?.id || "";

  const matchedLiveTake = task
    ? recentTakes.find((item) => item.taskId === task.id) || null
    : null;

  return (
    <section id="video-stage-preview" className="relative flex min-h-[540px] overflow-hidden rounded-2xl border border-zinc-800/90 bg-[#0b0b0d] text-zinc-100 shadow-sm lg:h-full lg:min-h-0">
      <div className="video-stage-grain pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="relative z-10 flex w-full flex-col p-4 sm:p-5">
        <header className="flex min-h-8 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "inline-flex size-2 rounded-full",
                inspectingHistory
                  ? selectedTake?.status === "success"
                    ? "bg-emerald-500"
                    : "bg-zinc-500"
                  : active
                    ? "animate-pulse bg-emerald-400"
                    : task?.status === "success"
                      ? "bg-emerald-500"
                      : "bg-zinc-600",
              )}
            />
            <p className="text-sm font-medium tracking-tight text-zinc-100">
              {inspectingHistory
                ? "历史镜头回放监看"
                : active
                  ? "Grok 渲染引擎工作中"
                  : task?.status === "success"
                    ? "视频已生成"
                    : "暗房监看画布"}
            </p>
            <span className="rounded-md border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
              {frame.ratio} · {stageResolutionLabel} · {stageSeconds}S
            </span>
          </div>

          <div className="flex items-center gap-2">
            {inspectingHistory ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-lg border-zinc-700/85 bg-zinc-900/90 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white"
                onClick={controller.clearSelectedTake}
              >
                {active ? (
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                ) : null}
                <span>{active ? "返回实时渲染" : "返回待机画布"}</span>
              </Button>
            ) : null}

            {active && !inspectingHistory ? (
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
          </div>
        </header>

        <div className="relative my-3 flex min-h-0 flex-1 items-center justify-center rounded-xl border border-zinc-800/70 bg-[#0e0e11] p-4 sm:p-6">
          <span className="pointer-events-none absolute top-3.5 left-3.5 size-3 border-t border-l border-zinc-600/60" />
          <span className="pointer-events-none absolute top-3.5 right-3.5 size-3 border-t border-r border-zinc-600/60" />
          <span className="pointer-events-none absolute bottom-3.5 left-3.5 size-3 border-b border-l border-zinc-600/60" />
          <span className="pointer-events-none absolute right-3.5 bottom-3.5 size-3 border-r border-b border-zinc-600/60" />

          <div
            className={cn(
              "relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 text-zinc-100 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]",
              frame.frameClass,
              frame.ratio === "9:16"
                ? "max-w-[320px]"
                : frame.ratio === "2:3"
                  ? "max-w-[380px]"
                  : frame.ratio === "1:1"
                    ? "max-w-[500px]"
                    : "max-w-[740px]",
            )}
          >
            <span className="pointer-events-none absolute top-2.5 left-2.5 z-20 size-2.5 border-t border-l border-zinc-600/60" />
            <span className="pointer-events-none absolute top-2.5 right-2.5 z-20 size-2.5 border-t border-r border-zinc-600/60" />
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 size-2.5 border-b border-l border-zinc-600/60" />
            <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-20 size-2.5 border-r border-b border-zinc-600/60" />

            {inspectingHistory && selectedTake ? (
              <HistoricalTakeStage controller={controller} take={selectedTake} />
            ) : (
              <>
                {active && task ? (
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
                  <EmptyResult
                    frameLabel={frame.ratio}
                    resolutionLabel={stageResolutionLabel}
                    onSelectChip={(value) => {
                      controller.appendCameraStyleChip(value);
                      document.getElementById("video-prompt")?.focus();
                    }}
                  />
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
                  <SuccessResult
                    controller={controller}
                    url={video.url}
                    durationSeconds={task.duration_seconds}
                    take={matchedLiveTake}
                  />
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
              </>
            )}
          </div>
        </div>

        <DarkroomFilmstripDock
          controller={controller}
          active={active}
          activeStageTakeId={activeStageTakeId}
          frameRatio={frame.ratio}
          resolutionLabel={stageResolutionLabel}
        />
      </div>
    </section>
  );
}

function HistoricalTakeStage({
  controller,
  take,
}: {
  controller: VideoCreationController;
  take: RecentVideoTake;
}) {
  if (take.status === "success" && take.videoUrl) {
    return (
      <SuccessResult
        controller={controller}
        url={take.videoUrl}
        durationSeconds={take.seconds}
        take={take}
      />
    );
  }
  if (take.status === "cancelled") {
    return (
      <CreationTaskMessageState
        tone="dark"
        icon={<Clock3 />}
        title="该历史镜头已取消"
        detail="可一键将当时的提示词与画幅参数填入左侧工作台继续创作。"
        actionLabel="填入提示词"
        actionIcon={<CornerUpLeft className="size-3.5" />}
        onAction={() => controller.applyRecentTakePrompt(take)}
        className="relative z-10"
      />
    );
  }
  return (
    <CreationTaskMessageState
      tone="dark"
      icon={<AlertCircle />}
      title="该镜头未生成可用视频"
      detail="可填入原镜头提示词调整参数后重新提交，或前往视频库查看归档。"
      actionLabel="填入提示词"
      actionIcon={<CornerUpLeft className="size-3.5" />}
      onAction={() => controller.applyRecentTakePrompt(take)}
      className="relative z-10"
    />
  );
}

function DarkroomFilmstripDock({
  controller,
  active,
  activeStageTakeId,
  frameRatio,
  resolutionLabel,
}: {
  controller: VideoCreationController;
  active: boolean;
  activeStageTakeId: string;
  frameRatio: string;
  resolutionLabel: string;
}) {
  const { recentTakes } = controller;

  if (recentTakes.length === 0) {
    return (
      <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/75 px-3.5 py-2 text-[11px] text-zinc-400">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
          <span>GROK IMAGINE 1.5</span>
          <span className="text-zinc-700">·</span>
          <span>6S–15S 镜头调度</span>
          <span className="text-zinc-700">·</span>
          <span>7 帧角色参考</span>
          <span className="text-zinc-700">·</span>
          <span>
            {frameRatio} {resolutionLabel}
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {active
            ? "离开页面不会中断任务；刷新后可继续查看生成进度"
            : "成片自动归档至云端视频库 · 最近生成将在此形成暗房胶片条"}
        </span>
      </footer>
    );
  }

  return (
    <footer
      aria-label="最近生成视频胶片条"
      className="shrink-0 rounded-xl border border-zinc-800/85 bg-zinc-950/90 px-3 py-2.5 backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-zinc-300 uppercase">
            RECENT TAKES · 最近生成
          </span>
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
            {recentTakes.length}/6
          </span>
        </div>
        <span className="hidden text-[11px] text-zinc-500 sm:inline">
          {active
            ? "离开页面不会中断任务；可随时切换预览已完成镜头"
            : "点击镜头切换舞台回放 · 一键回填提示词与参数"}
        </span>
      </div>

      <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        {recentTakes.map((take, index) => {
          const isSelected = activeStageTakeId === take.taskId;
          const isRunning = take.status === "queued" || take.status === "running";
          const isSuccess = take.status === "success";
          return (
            <div
              key={take.taskId}
              className={cn(
                "group relative flex w-[228px] shrink-0 items-center gap-2.5 rounded-lg border p-1.5 transition-all sm:w-[248px]",
                isSelected
                  ? "border-zinc-400/75 bg-zinc-900 text-zinc-100 shadow-xs ring-1 ring-white/10"
                  : "border-zinc-800/85 bg-zinc-900/45 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/85",
              )}
            >
              <button
                type="button"
                onClick={() => controller.selectRecentTake(take.taskId)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
                title={take.prompt || `切换到镜头 #${index + 1}`}
              >
                <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-black">
                  {isSuccess && take.videoUrl ? (
                    <>
                      <video
                        src={take.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
                      />
                      {!isSelected ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="size-3.5 fill-white text-white" />
                        </span>
                      ) : null}
                    </>
                  ) : isRunning ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <LoaderCircle className="size-3.5 animate-spin text-emerald-400" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-600">
                      <Film className="size-3.5" />
                    </div>
                  )}
                  <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/80 px-1 py-px font-mono text-[9px] leading-tight text-zinc-200 tabular-nums">
                    {take.ratio}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-zinc-200">
                    {take.prompt || `镜头 #${index + 1}`}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-400 tabular-nums">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        isRunning
                          ? "animate-pulse bg-emerald-400"
                          : isSuccess
                            ? "bg-emerald-500"
                            : "bg-zinc-600",
                      )}
                    />
                    <span>
                      {take.seconds}s · {take.resolutionName.toUpperCase()}
                    </span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  controller.applyRecentTakePrompt(take);
                  document.getElementById("video-prompt")?.focus();
                }}
                className="shrink-0 rounded-md border border-zinc-700/80 bg-zinc-800/90 px-2 py-1 text-[10px] font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-700 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                title="将该镜头的提示词与画幅参数填入左侧工作台"
              >
                填入提示词
              </button>
            </div>
          );
        })}
      </div>
    </footer>
  );
}

function EmptyResult({
  frameLabel,
  resolutionLabel,
  onSelectChip,
}: {
  frameLabel: string;
  resolutionLabel: string;
  onSelectChip: (descriptor: string) => void;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-3.5 px-5 py-6 text-center">
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
          在左侧设定镜头描述、时长与参考帧，或点击下方运镜词条快速构思画面
        </p>
      </div>

      <div className="mt-1 flex max-w-md flex-wrap items-center justify-center gap-1.5">
        {CAMERA_MOTION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onSelectChip(chip.value)}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/85 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
          >
            <Sparkles className="size-2.5 text-zinc-400" />
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SuccessResult({
  controller,
  url,
  durationSeconds,
  take,
}: {
  controller: VideoCreationController;
  url: string;
  durationSeconds?: number;
  take?: RecentVideoTake | null;
}) {
  return (
    <div className="relative z-10 flex h-full w-full flex-col justify-between bg-black">
      <video
        key={url}
        src={url}
        controls
        autoPlay
        muted
        loop
        playsInline
        className="h-full max-h-[56vh] w-full flex-1 object-contain"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/90 bg-zinc-950/90 px-3.5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>已自动归档至视频库</span>
          {durationSeconds ? (
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              · {Number(durationSeconds).toFixed(1)}s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {take ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
              onClick={() => {
                controller.applyRecentTakePrompt(take);
                document.getElementById("video-prompt")?.focus();
              }}
            >
              <CornerUpLeft className="size-3.5" />
              填入提示词
            </Button>
          ) : null}
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
    await copyText(taskID);
    toast.success("任务 ID 已复制");
  } catch {
    toast.error("复制任务 ID 失败");
  }
}
