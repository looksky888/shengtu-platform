import { ArrowUpRight, Plus, Sparkles } from "lucide-react";

import type { ImagePromptPreset } from "@/app/image/image-presets";

type ImageResultsEmptyStateProps = {
  promptPresets: readonly ImagePromptPreset[];
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
  onAppendStyleChip?: (descriptor: string) => void;
};

const QUICK_STYLE_CHIPS = [
  { label: "35mm 胶片颗粒", descriptor: "35mm 胶片颗粒质感，暗房柔和反差" },
  { label: "建筑自然漫射光", descriptor: "建筑天窗自然漫射柔光，细腻空间光影过渡" },
  { label: "博物馆典藏布光", descriptor: "博物馆典藏级漫射布光，温润材质微距细节" },
  { label: "电影级浅景深", descriptor: "电影级大光圈浅景深，柔和光学散景" },
  { label: "极简留白构图", descriptor: "极简主义大面积留白构图，克制低饱和高级灰配色" },
  { label: "赛博雨夜反射", descriptor: "潮湿沥青雨夜环境光反射，冷暖空气透视" },
] as const;

export function ImageResultsEmptyState({
  promptPresets,
  onApplyPromptPreset,
  onAppendStyleChip,
}: ImageResultsEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-1 py-4 sm:min-h-[380px] sm:py-6">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5">
        <div className="mx-auto flex max-w-[540px] flex-col items-center text-center">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/90 px-3 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase shadow-2xs">
            <Sparkles className="size-3 text-foreground/75" aria-hidden="true" />
            <span>VISUAL CREATION STUDIO</span>
          </span>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            开始新的视觉创作
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            在下方工作台描述构图与光影细节、拖拽上传参考图，或轻点展陈画作与美学词条一键起稿。
          </p>
        </div>

        {/* Curated 16:10 Gallery Plates — Mat Caption Architecture (Zero Artwork Text Collision, Eager Decode) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {promptPresets.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              className="group flex flex-col overflow-hidden rounded-xl border border-border/80 bg-surface p-1.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              onClick={() => void onApplyPromptPreset(preset)}
              aria-label={`套用预设：${preset.title}`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] bg-surface-muted">
                <img
                  src={preset.imageSrc}
                  alt={preset.title}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full select-none object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-black/[0.06] dark:ring-white/[0.08]" />

                <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/68 px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.06em] text-zinc-100 backdrop-blur-xs">
                  {preset.size || "Auto"}
                </span>

                <span className="pointer-events-none absolute bottom-2 right-2 inline-flex translate-y-1 items-center gap-0.5 rounded-full border border-white/25 bg-black/68 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 backdrop-blur-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  <span>载入灵感</span>
                  <ArrowUpRight className="size-3" />
                </span>
              </div>

              <div className="flex flex-col gap-0.5 px-1.5 pt-2 pb-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-xs font-semibold tracking-[-0.01em] text-foreground">
                    {preset.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-subtle-foreground">
                    0{idx + 1}
                  </span>
                </div>
                <p className="line-clamp-1 text-[11px] leading-4 text-muted-foreground">
                  {preset.hint}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* open-ai-canvas Style Quick-Start Aesthetic Style Chips */}
        {onAppendStyleChip ? (
          <div className="flex flex-col items-center gap-2 pt-0.5">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {QUICK_STYLE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onAppendStyleChip(chip.descriptor)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-border/80 bg-surface/90 px-2.5 text-[11px] font-medium text-muted-foreground shadow-2xs transition-all duration-150 hover:-translate-y-[1px] hover:border-foreground/35 hover:bg-surface hover:text-foreground active:scale-[0.98]"
                  title={`向提示词追加：${chip.descriptor}`}
                >
                  <Plus className="size-3 text-subtle-foreground" aria-hidden="true" />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
