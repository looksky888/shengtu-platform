import { Coins, Film, LoaderCircle, Square } from "lucide-react";

import { VideoReferenceInput } from "@/app/video/video-reference-input";
import { videoDurations, videoPresets, videoResolutions, videoSizes } from "@/app/video/video-options";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { VideoGenerationRequest } from "@/lib/video-task-api";

import type { VideoCreationController } from "./use-video-creation";

export function VideoForm({ controller }: { controller: VideoCreationController }) {
  const active = controller.task?.status === "queued" || controller.task?.status === "running";
  const estimatedCredits = controller.creditCostPerSecond * controller.seconds;

  return (
    <aside className="flex min-h-[680px] flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/88 shadow-[0_24px_70px_-48px_rgba(15,38,74,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#101218]/92">
      <div className="hide-scrollbar flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
        <VideoReferenceInput controller={controller} />

        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-prompt" className="text-sm font-semibold tracking-tight">画面描述</label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{controller.prompt.length}/4000</span>
          </div>
          <Textarea
            id="video-prompt"
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            placeholder="描述主体动作、环境、光线、镜头运动和节奏……"
            className="min-h-40 resize-y rounded-[16px] border-slate-200 bg-slate-50/80 px-4 py-3.5 leading-6 shadow-inner focus-visible:border-blue-400 focus-visible:ring-blue-400/20 dark:border-white/10 dark:bg-black/20"
            maxLength={4000}
          />
        </section>

        <ControlSection label="视频模型">
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton selected={controller.model === "grok-imagine-video-1.5"} onClick={() => controller.setModel("grok-imagine-video-1.5")}>
              <span>Video 1.5</span><span className="block text-[10px] font-normal opacity-65">Console · 多参考图</span>
            </ChoiceButton>
            <ChoiceButton selected={controller.model === "grok-imagine-video"} onClick={() => controller.setModel("grok-imagine-video")}>
              <span>Video 1.0</span><span className="block text-[10px] font-normal opacity-65">Web 生图视频</span>
            </ChoiceButton>
          </div>
        </ControlSection>

        <ControlSection label="视频比例">
          <div className="grid grid-cols-3 gap-2 rounded-[16px] bg-slate-100/80 p-1.5 dark:bg-black/25">
            {videoSizes.map((item) => {
              const selected = controller.size === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[12px] border text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 active:scale-[0.98]",
                    selected ? "border-blue-200 bg-white font-semibold text-[#1456f0] shadow-sm dark:border-blue-500/40 dark:bg-white/10 dark:text-blue-300" : "border-transparent text-muted-foreground hover:bg-white/70 hover:text-foreground dark:hover:bg-white/5",
                  )}
                  onClick={() => controller.setSize(item.value)}
                >
                  <span className={cn("rounded-[2px] border-2", item.shapeClass, selected ? "border-[#1456f0] dark:border-blue-300" : "border-current")} />
                  <span>{item.ratio}</span>
                </button>
              );
            })}
          </div>
        </ControlSection>

        <ControlSection label="生成时长" value={`${controller.seconds} 秒`}>
          <div className="grid grid-cols-3 gap-2">
            {videoDurations.map((seconds) => (
              <ChoiceButton key={seconds} selected={controller.seconds === seconds} onClick={() => controller.setSeconds(seconds)}>
                {seconds}s
              </ChoiceButton>
            ))}
          </div>
        </ControlSection>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <ControlSection label="清晰度">
            <div className="grid grid-cols-2 gap-2">
              {videoResolutions.map((item) => (
                <ChoiceButton key={item.value} selected={controller.resolutionName === item.value} onClick={() => controller.setResolutionName(item.value)}>
                  <span>{item.label}</span><span className="block text-[10px] font-normal opacity-65">{item.detail}</span>
                </ChoiceButton>
              ))}
            </div>
          </ControlSection>
          <ControlSection label="画面风格">
            <div className="grid grid-cols-2 gap-2">
              {videoPresets.map((item) => (
                <ChoiceButton key={item.value} selected={controller.preset === item.value} onClick={() => controller.setPreset(item.value)}>
                  {item.label}
                </ChoiceButton>
              ))}
            </div>
          </ControlSection>
        </div>
      </div>

      <div className="border-t border-slate-200/80 bg-white/92 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#11131a]/95 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Coins className="size-3.5" />预计消耗</span>
          <strong className="font-mono text-sm tabular-nums text-foreground">{estimatedCredits} 积分</strong>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="lg" className="h-12 flex-1 rounded-[14px] bg-[#1456f0] shadow-[0_14px_30px_-16px_rgba(20,86,240,0.9)] hover:bg-[#0f49cf] active:scale-[0.99]" onClick={() => void controller.submit()} disabled={controller.submitting || controller.uploadingReference || controller.uploadingReferences || active}>
            {controller.submitting ? <LoaderCircle className="animate-spin" /> : <Film />}
            {controller.submitting ? "正在提交" : `生成 ${controller.seconds} 秒视频`}
          </Button>
          {active ? <Button type="button" size="lg" variant="outline" className="h-12 rounded-[14px]" onClick={() => void controller.cancel()}><Square />取消</Button> : null}
        </div>
      </div>
    </aside>
  );
}

function ControlSection({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <section className="space-y-2.5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold tracking-tight">{label}</h2>{value ? <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-[#1456f0] dark:bg-blue-500/10 dark:text-blue-300">{value}</span> : null}</div>{children}</section>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} className={cn("min-h-11 rounded-[11px] border px-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 active:scale-[0.98]", selected ? "border-blue-200 bg-blue-50 text-[#1456f0] shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300" : "border-slate-200 bg-white/70 text-muted-foreground hover:border-blue-200 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]")} onClick={onClick}>{children}</button>;
}
