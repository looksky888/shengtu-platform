import { useRef, type ReactNode } from "react";
import { Film, LoaderCircle, Square, X } from "lucide-react";

import { VideoReferenceInput, type VideoInputMode } from "@/app/video/video-reference-input";
import {
  selectedVideoSize,
  videoDurations,
  videoPresets,
  videoResolutions,
  videoSizes,
} from "@/app/video/video-options";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";

import type { VideoCreationController } from "./use-video-creation";

const VIDEO_INPUT_MODES: ReadonlyArray<{ value: VideoInputMode; label: string }> = [
  { value: "t2v", label: "文生视频" },
  { value: "i2v", label: "图生视频" },
  { value: "ref", label: "多图参考" },
];

const STUDIO_TILE_SELECTED_CLASS =
  "border-foreground bg-surface font-semibold text-foreground shadow-xs ring-1 ring-foreground/15 dark:bg-zinc-800/90";
const STUDIO_TILE_IDLE_CLASS =
  "border-border/75 bg-surface-muted/55 font-medium text-muted-foreground hover:border-border-strong hover:bg-surface-hover hover:text-foreground";

const SEGMENT_GROOVE_CLASS =
  "rounded-xl bg-surface-muted/95 p-1 ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.04]";
const SEGMENT_PILL_SELECTED_CLASS =
  "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]";
const SEGMENT_PILL_IDLE_CLASS =
  "font-medium text-muted-foreground hover:text-foreground";

export function VideoForm({ controller }: { controller: VideoCreationController }) {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const active = controller.task?.status === "queued" || controller.task?.status === "running";
  const submitDisabled =
    controller.submitting ||
    controller.uploadingReference ||
    controller.uploadingReferences ||
    active;
  const estimatedCredits = controller.creditCostPerSecond * controller.seconds;
  const activeSizeSpec = selectedVideoSize(controller.size);
  const { inputMode, setInputMode } = controller;

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xs xl:h-full">
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
        <div
          className={cn("grid grid-cols-3 gap-1", SEGMENT_GROOVE_CLASS)}
          role="tablist"
          aria-label="视频创作模式"
        >
          {VIDEO_INPUT_MODES.map((item) => {
            const selected = inputMode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "flex h-8 items-center justify-center rounded-lg px-2 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                  selected ? SEGMENT_PILL_SELECTED_CLASS : SEGMENT_PILL_IDLE_CLASS,
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
            <label
              htmlFor="video-prompt"
              className="text-xs font-semibold tracking-tight text-foreground"
            >
              画面描述
            </label>
            <div className="flex items-center gap-2">
              {controller.prompt.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    controller.setPrompt("");
                    promptRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label="清空视频画面描述"
                >
                  <X className="size-3" />
                  <span>清空</span>
                </button>
              ) : null}
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {controller.prompt.length}/4000
              </span>
            </div>
          </div>

          <div
            className="studio-prompt-well cursor-text rounded-xl bg-surface-subtle/80 p-3 ring-1 ring-inset ring-border/70 transition-all focus-within:bg-surface focus-within:ring-foreground/30"
            onClick={() => promptRef.current?.focus()}
          >
            <Textarea
              ref={promptRef}
              id="video-prompt"
              value={controller.prompt}
              onChange={(event) => controller.setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (isImeComposing(event)) {
                  return;
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  if (!submitDisabled) {
                    void controller.submit();
                  }
                }
              }}
              placeholder="描述主体动作、环境光影、运镜轨迹与画面节奏（Ctrl/⌘ + Enter 提交生成）……"
              className="min-h-24 resize-y rounded-none border-0 bg-transparent p-0 text-sm leading-5.5 text-foreground shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-0"
              maxLength={4000}
            />
          </div>
        </section>

        <VideoReferenceInput controller={controller} mode={inputMode} />

        <ControlSection label="生成引擎">
          <div className="grid grid-cols-2 gap-1.5">
            <StudioTileCard
              selected={controller.model === "grok-imagine-video-1.5"}
              onClick={() => controller.setModel("grok-imagine-video-1.5")}
            >
              <span className="block text-xs font-semibold text-current">Video 1.5</span>
              <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                Console · 多图一致性
              </span>
            </StudioTileCard>
            <StudioTileCard
              selected={controller.model === "grok-imagine-video"}
              onClick={() => controller.setModel("grok-imagine-video")}
            >
              <span className="block text-xs font-semibold text-current">Video 1.0</span>
              <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                Web · 标准视频生成
              </span>
            </StudioTileCard>
          </div>
        </ControlSection>

        <ControlSection label="画幅比例" meta={`${activeSizeSpec.label} · ${activeSizeSpec.value}`}>
          <div className="grid grid-cols-5 gap-1.5">
            {videoSizes.map((item) => {
              const selected = controller.size === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  title={`${item.label} (${item.value})`}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-[11px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                    selected ? STUDIO_TILE_SELECTED_CLASS : STUDIO_TILE_IDLE_CLASS,
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
          <ControlSection label="生成时长">
            <div className={cn("grid grid-cols-3 gap-1", SEGMENT_GROOVE_CLASS)}>
              {videoDurations.map((seconds) => {
                const selected = controller.seconds === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-lg font-mono text-xs tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                      selected ? SEGMENT_PILL_SELECTED_CLASS : SEGMENT_PILL_IDLE_CLASS,
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
            <div className={cn("grid grid-cols-2 gap-1", SEGMENT_GROOVE_CLASS)}>
              {videoResolutions.map((item) => {
                const selected = controller.resolutionName === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-lg font-mono text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                      selected ? SEGMENT_PILL_SELECTED_CLASS : SEGMENT_PILL_IDLE_CLASS,
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
          <div className={cn("grid grid-cols-4 gap-1", SEGMENT_GROOVE_CLASS)}>
            {videoPresets.map((item) => {
              const selected = controller.preset === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg px-2 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
                    selected ? SEGMENT_PILL_SELECTED_CLASS : SEGMENT_PILL_IDLE_CLASS,
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

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/65 bg-surface/95 p-3.5 backdrop-blur-sm">
        <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-surface-muted/75 px-3 py-1.5 text-[11px]">
          <span className="font-mono text-muted-foreground tabular-nums">
            {activeSizeSpec.ratio} · {controller.resolutionName.toUpperCase()} · {controller.seconds}s
          </span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            预计消耗 {estimatedCredits} 积分
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="h-9.5 flex-1 rounded-xl bg-primary font-medium text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-[0.98]"
            onClick={() => void controller.submit()}
            disabled={submitDisabled}
          >
            {controller.submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Film className="size-4" />
            )}
            <span>
              {controller.submitting ? "正在提交" : `生成 ${controller.seconds} 秒视频`}
            </span>
            {!controller.submitting ? (
              <Kbd className="ml-0.5 border-white/20 bg-white/15 text-[10px] text-current shadow-none">
                ⌘⏎
              </Kbd>
            ) : null}
          </Button>
          {active ? (
            <Button
              type="button"
              variant="outline"
              className="h-9.5 rounded-xl"
              onClick={() => void controller.cancel()}
            >
              <Square className="size-3.5" />
              取消
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function ControlSection({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">{label}</h2>
        {meta ? (
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StudioTileCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-h-11 rounded-xl border px-3 py-2 text-left text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.98]",
        selected ? STUDIO_TILE_SELECTED_CLASS : STUDIO_TILE_IDLE_CLASS,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
