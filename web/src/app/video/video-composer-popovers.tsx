import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Coins,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import {
  ratioPreviewStyle,
  selectedVideoModel,
  selectedVideoPreset,
  selectedVideoSize,
  videoDurations,
  videoModels,
  videoPresets,
  videoResolutions,
  videoSizes,
} from "@/app/video/video-options";
import type { VideoCreationController } from "@/app/video/use-video-creation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function VideoComposerToolbarPopovers({
  controller,
}: {
  controller: VideoCreationController;
}) {
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [durationPopoverOpen, setDurationPopoverOpen] = useState(false);

  const activeSizeSpec = selectedVideoSize(controller.size);
  const activeModelSpec = selectedVideoModel(controller.model);
  const activePresetSpec = selectedVideoPreset(controller.preset);

  return (
    <>
      {/* Model Picker Pill */}
      <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-muted/85 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-hover hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            title="选择视频生成模型"
          >
            <Sparkles className="size-3.5 text-muted-foreground" />
            <span>{activeModelSpec.shortLabel}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72 p-2">
          <div className="mb-1.5 px-2 pt-1 text-[11px] font-semibold text-muted-foreground">
            视频生成引擎
          </div>
          <div className="space-y-1">
            {videoModels.map((item) => {
              const selected = controller.model === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    controller.setModel(item.value);
                    setModelPopoverOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "bg-surface-muted text-foreground"
                      : "text-foreground/85 hover:bg-surface-hover",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <span className="rounded bg-foreground/[0.07] px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        {item.badge}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  {selected ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Ratio + Resolution + Motion Preset Pill */}
      <Popover open={settingsPopoverOpen} onOpenChange={setSettingsPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-muted/85 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-hover hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            title="画幅比例、清晰度与动态风格"
          >
            <span className="inline-flex size-4 items-center justify-center">
              <span
                style={ratioPreviewStyle(activeSizeSpec.ratio, 13)}
                className="rounded-[2px] border border-current opacity-80"
              />
            </span>
            <span className="font-mono tabular-nums">
              {activeSizeSpec.ratio} · {controller.resolutionName.toUpperCase()}
            </span>
            {controller.preset !== "custom" ? (
              <span className="hidden text-muted-foreground lg:inline">
                · {activePresetSpec.label}
              </span>
            ) : null}
            <SlidersHorizontal className="size-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[320px] space-y-3.5 p-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">画幅比例</span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {activeSizeSpec.label} · {activeSizeSpec.value}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {videoSizes.map((item) => {
                const selected = controller.size === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => controller.setSize(item.value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] transition-all",
                      selected
                        ? "border-foreground bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-foreground/15 dark:bg-zinc-800/90"
                        : "border-border/75 bg-surface-muted/55 font-medium text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    <span className="flex size-4 items-center justify-center">
                      <span
                        style={ratioPreviewStyle(item.ratio, 14)}
                        className="rounded-[2px] border border-current"
                      />
                    </span>
                    <span className="font-mono text-[10.5px] tabular-nums">{item.ratio}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground">输出清晰度</span>
            <div className="grid grid-cols-2 gap-1.5">
              {videoResolutions.map((item) => {
                const selected = controller.resolutionName === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => controller.setResolutionName(item.value)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition-all",
                      selected
                        ? "border-foreground bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-foreground/15 dark:bg-zinc-800/90"
                        : "border-border/75 bg-surface-muted/55 font-medium text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    <span className="font-mono">{item.label}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {item.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-foreground">动态与运镜风格</span>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted/95 p-1 ring-1 ring-inset ring-black/[0.03] dark:ring-white/[0.05]">
              {videoPresets.map((item) => {
                const selected = controller.preset === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    title={item.detail}
                    onClick={() => controller.setPreset(item.value)}
                    className={cn(
                      "flex h-7.5 items-center justify-center rounded-lg px-1.5 text-xs transition-all",
                      selected
                        ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Duration Pill */}
      <Popover open={durationPopoverOpen} onOpenChange={setDurationPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-muted/85 px-2.5 font-mono text-xs font-medium text-foreground/90 tabular-nums transition-colors hover:bg-surface-hover hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            title="选择视频生成时长"
          >
            <Clock3 className="size-3.5 text-muted-foreground" />
            <span>{controller.seconds}s</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-60 p-2">
          <div className="mb-1.5 px-2 pt-1 text-[11px] font-semibold text-muted-foreground">
            镜头生成时长
          </div>
          <div className="space-y-1">
            {videoDurations.map((item) => {
              const selected = controller.seconds === item.value;
              const cost = controller.creditCostPerSecond * item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    controller.setSeconds(item.value);
                    setDurationPopoverOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "bg-surface-muted font-semibold text-foreground"
                      : "text-foreground/85 hover:bg-surface-hover",
                  )}
                >
                  <div>
                    <span className="font-mono text-xs">{item.label}</span>
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {item.detail}
                    </span>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                    <Coins
                      className="size-3 text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    />
                    {cost} 积分
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
