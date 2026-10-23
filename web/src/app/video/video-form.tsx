import { useEffect, useState } from "react";
import { Film, LoaderCircle, Square } from "lucide-react";

import { VideoReferenceInput, type VideoInputMode } from "@/app/video/video-reference-input";
import { videoDurations, videoPresets, videoResolutions, videoSizes } from "@/app/video/video-options";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

const VIDEO_INPUT_MODES: ReadonlyArray<{ value: VideoInputMode; label: string }> = [
  { value: "t2v", label: "文生视频" },
  { value: "i2v", label: "图生视频" },
  { value: "ref", label: "多图参考" },
];

export function VideoForm({ controller }: { controller: VideoCreationController }) {
  const active = controller.task?.status === "queued" || controller.task?.status === "running";
  const estimatedCredits = controller.creditCostPerSecond * controller.seconds;
  const [inputMode, setInputMode] = useState<VideoInputMode>(() =>
    controller.uploadedReference || controller.inputReference.trim()
      ? "i2v"
      : controller.selectedReferenceAssetIds.length > 0
        ? "ref"
        : "t2v",
  );

  useEffect(() => {
    if (controller.uploadedReference || controller.inputReference.trim()) {
      setInputMode("i2v");
    }
  }, [controller.inputReference, controller.uploadedReference]);

  useEffect(() => {
    if (controller.selectedReferenceAssetIds.length > 0 && inputMode === "t2v") {
      setInputMode("ref");
    }
  }, [controller.selectedReferenceAssetIds.length, inputMode]);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/75 bg-surface shadow-2xs xl:h-full">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/65 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md border border-border/75 bg-surface-muted text-foreground">
            <Film className="size-3.5" />
          </span>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            视频创作工作台
          </h1>
        </div>
        <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          Grok Imagine
        </span>
      </header>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-surface-muted/95 p-1" role="tablist" aria-label="视频创作模式">
          {VIDEO_INPUT_MODES.map((item) => {
            const selected = inputMode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "flex h-8 items-center justify-center rounded-[7px] px-2 text-xs transition-all",
                  selected
                    ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.04] dark:bg-zinc-800/95 dark:ring-white/[0.08]"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setInputMode(item.value)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-prompt" className="text-xs font-semibold tracking-tight text-foreground">
              画面描述
            </label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {controller.prompt.length}/4000
            </span>
          </div>
          <Textarea
            id="video-prompt"
            value={controller.prompt}
            onChange={(event) => controller.setPrompt(event.target.value)}
            placeholder="描述主体动作、环境光影、运镜轨迹与画面节奏……"
            className="min-h-24 resize-y rounded-xl border-border/80 bg-surface-muted/40 px-3 py-2.5 text-sm leading-5 focus-visible:border-foreground/35 focus-visible:ring-foreground/10"
            maxLength={4000}
          />
        </section>

        <VideoReferenceInput controller={controller} mode={inputMode} />

        <ControlSection label="生成引擎">
          <div className="grid grid-cols-2 gap-1.5">
            <ChoiceCard
              selected={controller.model === "grok-imagine-video-1.5"}
              onClick={() => controller.setModel("grok-imagine-video-1.5")}
            >
              <span className="block font-semibold">Video 1.5</span>
              <span className="block text-[10px] font-normal text-muted-foreground">Console · 多图一致性</span>
            </ChoiceCard>
            <ChoiceCard
              selected={controller.model === "grok-imagine-video"}
              onClick={() => controller.setModel("grok-imagine-video")}
            >
              <span className="block font-semibold">Video 1.0</span>
              <span className="block text-[10px] font-normal text-muted-foreground">Web · 标准视频生成</span>
            </ChoiceCard>
          </div>
        </ControlSection>

        <ControlSection label="画幅比例">
          <div className="grid grid-cols-5 gap-1.5">
            {videoSizes.map((item) => {
              const selected = controller.size === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                    selected
                      ? "border-foreground bg-foreground font-medium text-background shadow-2xs"
                      : "border-border/70 bg-surface-muted/60 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                  onClick={() => controller.setSize(item.value)}
                >
                  <span className={cn("rounded-[2px] border border-current", item.shapeClass)} />
                  <span className="font-mono text-[11px] tabular-nums">{item.ratio}</span>
                </button>
              );
            })}
          </div>
        </ControlSection>

        <div className="grid grid-cols-2 gap-3">
          <ControlSection label="生成时长" value={`${controller.seconds}s`}>
            <div className="grid grid-cols-3 gap-1.5">
              {videoDurations.map((seconds) => {
                const selected = controller.seconds === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg border font-mono text-xs tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                      selected
                        ? "border-foreground/85 bg-surface font-semibold text-foreground shadow-xs ring-1 ring-foreground/10"
                        : "border-border/70 bg-surface-muted/60 font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    )}
                    onClick={() => controller.setSeconds(seconds)}
                  >
                    {seconds}s
                  </button>
                );
              })}
            </div>
          </ControlSection>

          <ControlSection label="输出清晰度">
            <div className="grid grid-cols-2 gap-1.5">
              {videoResolutions.map((item) => {
                const selected = controller.resolutionName === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg border font-mono text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                      selected
                        ? "border-foreground/85 bg-surface font-semibold text-foreground shadow-xs ring-1 ring-foreground/10"
                        : "border-border/70 bg-surface-muted/60 font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    )}
                    onClick={() => controller.setResolutionName(item.value)}
                    title={item.detail}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </ControlSection>
        </div>

        <ControlSection label="动态风格">
          <div className="grid grid-cols-4 gap-1.5">
            {videoPresets.map((item) => {
              const selected = controller.preset === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex h-8.5 items-center justify-center rounded-lg border px-2 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                    selected
                      ? "border-foreground/85 bg-surface font-semibold text-foreground shadow-xs ring-1 ring-foreground/10"
                      : "border-border/70 bg-surface-muted/60 font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                  onClick={() => controller.setPreset(item.value)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </ControlSection>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-surface/95 p-3.5 backdrop-blur-sm">
        <div className="mb-2.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">预计消耗</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {estimatedCredits} 积分
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="h-9.5 flex-1 rounded-xl bg-primary text-primary-foreground font-medium shadow-xs hover:bg-primary/90 active:scale-[0.98]"
            onClick={() => void controller.submit()}
            disabled={controller.submitting || controller.uploadingReference || controller.uploadingReferences || active}
          >
            {controller.submitting ? <LoaderCircle className="animate-spin" /> : <Film className="size-4" />}
            {controller.submitting ? "正在提交" : `生成 ${controller.seconds} 秒视频`}
          </Button>
          {active ? (
            <Button type="button" variant="outline" className="h-9.5 rounded-xl" onClick={() => void controller.cancel()}>
              <Square className="size-3.5" />
              取消
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ControlSection({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">{label}</h2>
        {value ? (
          <span className="font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
            {value}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ChoiceCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-h-11 rounded-xl border px-3 py-2 text-left text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
        selected
          ? "border-foreground/85 bg-surface text-foreground shadow-xs ring-1 ring-foreground/10"
          : "border-border/70 bg-surface-muted/60 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
