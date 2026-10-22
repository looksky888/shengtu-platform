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
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs xl:h-full">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Film className="size-3.5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              视频创作参数
            </h1>
          </div>
        </div>
        <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          Grok Imagine
        </span>
      </header>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-prompt" className="text-xs font-semibold tracking-tight text-foreground">画面描述</label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{controller.prompt.length}/4000</span>
          </div>
          <Textarea
            id="video-prompt"
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            placeholder="描述主体动作、环境、光线、镜头运动和节奏……"
            className="min-h-24 resize-y rounded-lg border-border/70 bg-muted/25 px-3 py-2.5 text-sm leading-5 focus-visible:border-primary/40 focus-visible:ring-primary/20"
            maxLength={4000}
          />
        </section>

        <VideoReferenceInput controller={controller} />

        <ControlSection label="视频模型">
          <div className="grid grid-cols-2 gap-1.5">
            <ChoiceButton selected={controller.model === "grok-imagine-video-1.5"} onClick={() => controller.setModel("grok-imagine-video-1.5")}>
              <span>Video 1.5</span><span className="block text-[10px] font-normal opacity-70">Console · 多参考图</span>
            </ChoiceButton>
            <ChoiceButton selected={controller.model === "grok-imagine-video"} onClick={() => controller.setModel("grok-imagine-video")}>
              <span>Video 1.0</span><span className="block text-[10px] font-normal opacity-70">Web 生图视频</span>
            </ChoiceButton>
          </div>
        </ControlSection>

        <div className="grid grid-cols-2 gap-3">
          <ControlSection label="视频比例">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
              {videoSizes.map((item) => {
                const selected = controller.size === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]",
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

          <ControlSection label="生成时长" value={`${controller.seconds}s`}>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
              {videoDurations.map((seconds) => {
                const selected = controller.seconds === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-10 items-center justify-center rounded-md border text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]",
                      selected
                        ? "border-primary/30 bg-background font-semibold text-primary shadow-2xs"
                        : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    )}
                    onClick={() => controller.setSeconds(seconds)}
                  >
                    {seconds}s
                  </button>
                );
              })}
            </div>
          </ControlSection>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ControlSection label="清晰度">
            <div className="grid grid-cols-2 gap-1.5">
              {videoResolutions.map((item) => (
                <ChoiceButton key={item.value} selected={controller.resolutionName === item.value} onClick={() => controller.setResolutionName(item.value)}>
                  <span>{item.label}</span><span className="block text-[10px] font-normal opacity-70">{item.detail}</span>
                </ChoiceButton>
              ))}
            </div>
          </ControlSection>
          <ControlSection label="画面风格">
            <div className="grid grid-cols-2 gap-1.5">
              {videoPresets.map((item) => (
                <ChoiceButton key={item.value} selected={controller.preset === item.value} onClick={() => controller.setPreset(item.value)}>
                  {item.label}
                </ChoiceButton>
              ))}
            </div>
          </ControlSection>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-card/95 p-3.5 backdrop-blur-sm">
        <div className="mb-2.5 flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Coins className="size-3.5 text-amber-500" />预计消耗</span>
          <strong className="font-mono text-sm tabular-nums text-foreground">{estimatedCredits} 积分</strong>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="h-9 flex-1 rounded-lg" onClick={() => void controller.submit()} disabled={controller.submitting || controller.uploadingReference || controller.uploadingReferences || active}>
            {controller.submitting ? <LoaderCircle className="animate-spin" /> : <Film />}
            {controller.submitting ? "正在提交" : `生成 ${controller.seconds} 秒视频`}
          </Button>
          {active ? <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => void controller.cancel()}><Square />取消</Button> : null}
        </div>
      </div>
    </aside>
  );
}

function ControlSection({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <section className="space-y-1.5"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold tracking-tight text-foreground">{label}</h2>{value ? <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">{value}</span> : null}</div>{children}</section>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} className={cn("min-h-9 rounded-lg border px-2 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]", selected ? "border-primary/40 bg-primary/10 text-primary shadow-2xs" : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground")} onClick={onClick}>{children}</button>;
}
