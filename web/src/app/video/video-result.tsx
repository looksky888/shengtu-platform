import { AlertCircle, CheckCircle2, Clock3, Film, Library, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { selectedVideoSize } from "@/app/video/video-options";
import { Button } from "@/components/ui/button";
import { CreationTaskCancelButton, CreationTaskMessageState, CreationTaskProgressState } from "@/components/creation-task-state";
import type { CreationTask } from "@/lib/api";
import { creationTaskFailure } from "@/lib/creation-task-errors";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

export function VideoResult({ controller }: { controller: VideoCreationController }) {
  const { task, video, pollError } = controller;
  const frame = selectedVideoSize(controller.size);
  const active = task?.status === "queued" || task?.status === "running";

  return (
    <section className="relative flex min-h-[680px] overflow-hidden rounded-[28px] border border-[#1c2540] bg-[#070910] text-white shadow-[0_30px_90px_-55px_rgba(17,38,95,0.95)] xl:sticky xl:top-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_45%,rgba(37,66,152,0.22),transparent_38%),radial-gradient(circle_at_48%_75%,rgba(55,48,163,0.13),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative z-10 flex w-full flex-col p-4 sm:p-6">
        <header className="flex min-h-10 items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300/60">Render stage</p>
            <p className="mt-1 text-sm font-medium text-white/80">{active ? "Grok 渲染引擎工作中" : task?.status === "success" ? "视频已生成" : "视频预览舞台"}</p>
          </div>
          {active ? <CreationTaskCancelButton tone="dark" label="终止任务" onCancel={() => void controller.cancel()} /> : <Button asChild size="sm" variant="ghost" className="rounded-full text-white/55 hover:bg-white/10 hover:text-white"><Link to="/video-library"><Library />视频库</Link></Button>}
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div className={cn("relative flex w-full items-center justify-center overflow-hidden rounded-[26px] border border-indigo-500/55 bg-[#0c0e13] shadow-[0_0_0_1px_rgba(98,77,230,0.12),0_0_55px_-20px_rgba(78,76,217,0.55)]", frame.frameClass, frame.ratio === "9:16" ? "max-w-[340px]" : frame.ratio === "1:1" ? "max-w-[560px]" : "max-w-[780px]")}> 
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(62,69,178,0.28),transparent_48%),radial-gradient(circle_at_50%_100%,rgba(120,129,255,0.18),transparent_42%)]" />
            <div className="video-stage-grain pointer-events-none absolute inset-0 opacity-[0.16]" />
            {active ? (
              <CreationTaskProgressState
                tone="dark"
                progress={task.progress ?? 0}
                indeterminate={typeof task.progress !== "number"}
                stage={task.progress_stage || (task.status === "queued" ? "正在排队" : "正在生成视频")}
                message={task.progress_message}
                taskId={task.id}
                onCopyTaskId={() => void copyTaskID(task.id)}
                className="relative z-10"
              />
            ) : null}
            {!task && !pollError ? <EmptyResult frameLabel={frame.ratio} /> : null}
            {pollError ? <CreationTaskMessageState tone="dark" icon={<AlertCircle />} title="任务状态读取失败" detail={pollError} /> : null}
            {task?.status === "error" ? <VideoFailureState controller={controller} task={task} /> : null}
            {task?.status === "cancelled" ? <CreationTaskMessageState tone="dark" icon={<Clock3 />} title="任务已取消" detail="调整提示词或生成参数后可以重新提交。" /> : null}
            {task?.status === "success" && video?.url ? <SuccessResult controller={controller} task={task} /> : null}
            {task?.status === "success" && !video?.url ? <CreationTaskMessageState tone="dark" icon={<AlertCircle />} title="任务完成但未找到视频" detail="请前往视频库检查归档结果。" actionLabel="打开视频库" actionHref="/video-library" /> : null}
          </div>
        </div>

        <footer className="flex min-h-8 items-center justify-center text-center text-[11px] text-white/35">
          {active ? "离开页面不会中断任务；刷新后可继续查看生成进度" : "生成的视频会自动保存到视频库"}
        </footer>
      </div>
    </section>
  );
}

function EmptyResult({ frameLabel }: { frameLabel: string }) {
  return <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center"><div className="flex size-16 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.045] text-blue-300/80 shadow-inner"><Film className="size-6" /></div><div><p className="font-display text-lg font-medium">准备生成 {frameLabel} 视频</p><p className="mt-1 max-w-xs text-xs leading-5 text-white/40">在左侧设置画面、时长和首帧，然后开始生成</p></div></div>;
}

function SuccessResult({ controller, task }: { controller: VideoCreationController; task: CreationTask }) {
  return <div className="relative z-10 flex flex-col items-center px-6 text-center"><div className="flex size-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_35px_-12px_rgba(52,211,153,0.7)]"><CheckCircle2 className="size-7" /></div><h2 className="font-display mt-5 text-2xl font-medium">视频已生成</h2><p className="mt-2 max-w-xs text-xs leading-5 text-white/45">已保存到视频库。观看后，本页会清除这条完成记录。</p><Button type="button" size="lg" className="mt-6 rounded-full bg-white px-6 text-slate-950 hover:bg-white/90" onClick={controller.watchVideo}><Play className="fill-current" />观看视频</Button>{task.duration_seconds ? <p className="mt-4 font-mono text-[10px] text-white/30">生成耗时 {task.duration_seconds.toFixed(1)} 秒</p> : null}</div>;
}

function VideoFailureState({ controller, task }: { controller: VideoCreationController; task: CreationTask }) {
  const failure = creationTaskFailure(task);
  const retryAction = failure.retryable && !failure.actionHref ? () => void controller.submit() : undefined;
  const copyAction = !failure.retryable && !failure.actionHref ? () => void copyTaskID(task.id) : undefined;
  return <CreationTaskMessageState tone="dark" icon={<AlertCircle />} title={failure.title} detail={failure.detail} actionLabel={failure.actionLabel} actionHref={failure.actionHref} onAction={retryAction || copyAction} actionDisabled={controller.submitting} className="relative z-10" />;
}

async function copyTaskID(taskID: string) {
  try { await navigator.clipboard.writeText(taskID); toast.success("任务 ID 已复制"); } catch { toast.error("复制任务 ID 失败"); }
}
