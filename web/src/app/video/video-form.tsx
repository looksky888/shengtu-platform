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
    <aside className="flex min-h-[660px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <div className="hide-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
        <VideoReferenceInput controller={controller} />

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-prompt" className="text-xs font-semibold tracking-tight text-foreground">画面描述</label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{controller.prompt.length}/4000</span>
          </div>
          <Textarea
            id="video-prompt"
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            placeholder="描述主体动作、环境、光线、镜头运动和节奏……"
            className="min-h-36 resize-y rounded-lg border-border/70 bg-muted/25 px-3.5 py-3 text-sm leading-6 focus-visible:border-primary/40 focus-visible:ring-primary/20"
            maxLength={4000}
          />
        </section>

        <ControlSection label="视频模型">
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton selected={controller.model === "grok-imagine-video-1.5"} onClick={() => controller.setModel("grok-imagine-video-1.5")}>
              <span>Video 1.5</span><span className="block text-[10px] font-normal opacity-70">Console · 多参考图</span>
            </ChoiceButton>
            <ChoiceButton selected={controller.model === "grok-imagine-video"} onClick={() => controller.setModel("grok-imagine-video")}>
              <span>Video 1.0</span><span className="block text-[10px] font-normal opacity-70">Web 生图视频</span>
            </ChoiceButton>
          </div>
        </ControlSection>

        <ControlSection label="视频比例">
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
            {videoSizes.map((item) => {
              const selected = controller.size === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]",
                    selected
                      ? "border-primary/30 bg-background font-semibold text-primary shadow-2xs"
                      : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                  onClick={() => controller.setSize(item.value)}
                >
                  <span className={cn("rounded-[2px] border-2", item.shapeClass, selected ? "border-primary" : "border-current")} />
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <ControlSection label="清晰度">
            <div className="grid grid-cols-2 gap-2">
              {videoResolutions.map((item) => (
                <ChoiceButton key={item.value} selected={controller.resolutionName === item.value} onClick={() => controller.setResolutionName(item.value)}>
                  <span>{item.label}</span><span className="block text-[10px] font-normal opacity-70">{item.detail}</span>
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

      <div className="border-t border-border/70 bg-muted/15 p-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Coins className="size-3.5" />预计消耗</span>
          <strong className="font-mono text-sm tabular-nums text-foreground">{estimatedCredits} 积分</strong>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="h-10 flex-1 rounded-lg" onClick={() => void controller.submit()} disabled={controller.submitting || controller.uploadingReference || controller.uploadingReferences || active}>
            {controller.submitting ? <LoaderCircle className="animate-spin" /> : <Film />}
            {controller.submitting ? "正在提交" : `生成 ${controller.seconds} 秒视频`}
          </Button>
          {active ? <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => void controller.cancel()}><Square />取消</Button> : null}
        </div>
      </div>
    </aside>
  );
}

function ControlSection({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold tracking-tight text-foreground">{label}</h2>{value ? <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">{value}</span> : null}</div>{children}</section>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} className={cn("min-h-10 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]", selected ? "border-primary/40 bg-primary/10 text-primary shadow-2xs" : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground")} onClick={onClick}>{children}</button>;
}
