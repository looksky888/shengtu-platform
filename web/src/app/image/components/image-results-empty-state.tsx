import { Plus, Sparkles } from "lucide-react";

import type { ImagePromptPreset } from "@/app/image/image-presets";

type ImageResultsEmptyStateProps = {
  promptPresets: readonly ImagePromptPreset[];
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
  onAppendStyleChip?: (descriptor: string) => void;
};

const QUICK_STYLE_CHIPS = [
  { label: "电影级光影", descriptor: "电影级大光圈浅景深，柔和自然体积光" },
  { label: "胶片质感", descriptor: "35mm 胶片细腻颗粒，温暖自然色调" },
  { label: "文博展板图鉴", descriptor: "博物馆典藏级漫射布光，温润材质微距细节" },
  { label: "极简留白构图", descriptor: "极简主义留白构图，克制柔和高级配色" },
  { label: "循环微动效 GIF", descriptor: "画面主体保持稳定，发丝与光影柔和自然循环律动" },
] as const;

export function ImageResultsEmptyState({
  promptPresets,
  onApplyPromptPreset,
  onAppendStyleChip,
}: ImageResultsEmptyStateProps) {
  return (
    <div className="flex min-h-[300px] items-center justify-center px-0 py-3 text-center sm:min-h-[420px] sm:py-6">
      <div className="mx-auto flex w-full max-w-[1140px] flex-col gap-5">
        <div className="mx-auto flex max-w-[640px] flex-col items-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d9e6ff] bg-[#edf4ff] px-3.5 py-1 text-xs font-medium text-[#1456f0] dark:border-sky-500/30 dark:bg-sky-950/45 dark:text-sky-300">
            <Sparkles className="size-3.5 text-[#1456f0] dark:text-sky-400" />
            生图预设
          </div>
          <h1 className="font-display text-3xl leading-[1.08] font-medium text-[#222222] dark:text-foreground sm:text-5xl">
            Turn ideas into images
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm leading-6 text-[#45515e] dark:text-muted-foreground sm:text-[15px]">
            选择一组真实案例预设快速开始，也可以直接在下方输入自己的画面描述。
          </p>

          {onAppendStyleChip ? (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
              {QUICK_STYLE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onAppendStyleChip(chip.descriptor)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-[#fbfdff] px-2.5 text-[11px] font-medium text-[#45515e] shadow-2xs transition hover:-translate-y-[1px] hover:border-[#1456f0]/35 hover:bg-[#edf4ff] hover:text-[#1456f0] active:scale-[0.98] dark:bg-card dark:text-muted-foreground dark:hover:border-sky-400/35 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
                  title={`向提示词追加：${chip.descriptor}`}
                >
                  <Plus className="size-3 text-[#1456f0]/75 dark:text-sky-400" aria-hidden="true" />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="hide-scrollbar flex gap-3 overflow-x-auto px-1 pb-1 text-left sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {promptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="soft-card-shadow group flex w-[250px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-border bg-[#fbfdff] text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#1456f0]/30 hover:shadow-[0_12px_24px_-6px_rgba(20,86,240,0.12)] sm:w-auto dark:bg-card dark:hover:border-sky-400/35"
              onClick={() => void onApplyPromptPreset(preset)}
              aria-label={`套用预设：${preset.title}`}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#eef2f8] dark:bg-surface-muted">
                <img
                  src={preset.imageSrc}
                  alt={preset.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-8 pb-2">
                  <span className="rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-medium text-[#18181b] shadow-sm">
                    {preset.size || "Auto"}
                  </span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur">
                    {preset.count} 张
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-2 px-4 py-3.5">
                <div className="space-y-1.5">
                  <div className="font-display text-sm font-semibold text-[#222222] dark:text-foreground">
                    {preset.title}
                  </div>
                  <div className="line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">
                    {preset.hint}
                  </div>
                </div>
                <div className="border-t border-border/70 pt-2 text-xs font-semibold text-[#1456f0] dark:text-sky-400">
                  套用这个预设
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
