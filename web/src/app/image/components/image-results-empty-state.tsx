import { Sparkles } from "lucide-react";

import type { ImagePromptPreset } from "@/app/image/image-presets";

type ImageResultsEmptyStateProps = {
  promptPresets: readonly ImagePromptPreset[];
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
};

export function ImageResultsEmptyState({ promptPresets, onApplyPromptPreset }: ImageResultsEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center px-0 py-3 text-center sm:min-h-[420px] sm:py-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
        <div className="mx-auto flex max-w-[640px] flex-col items-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#f0f0f0] px-3 py-1 text-xs font-medium text-[#45515e]">
            <Sparkles className="size-4 text-[#1456f0]" />
            生图预设
          </div>
          <h1 className="font-display text-3xl leading-[1.08] font-medium text-[#222222] sm:text-5xl">
            Turn ideas into images
          </h1>
          <p className="mx-auto mt-3 max-w-[460px] text-sm leading-6 text-[#45515e] sm:text-[15px]">
            选择一组真实案例预设快速开始，也可以直接在下方输入自己的画面描述。
          </p>
        </div>
        <div className="hide-scrollbar flex gap-3 overflow-x-auto px-1 pb-1 text-left sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {promptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="group w-[250px] shrink-0 overflow-hidden rounded-[22px] border border-[#f2f3f5] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_16px_-4px_rgba(36,36,36,0.08)] sm:w-auto"
              onClick={() => void onApplyPromptPreset(preset)}
              aria-label={`套用预设：${preset.title}`}
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#f0f0f0]">
                <img
                  src={preset.imageSrc}
                  alt={preset.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-8 pb-2">
                  <span className="rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-medium text-[#18181b] shadow-sm">
                    {preset.size || "Auto"}
                  </span>
                  <span className="rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur">
                    {preset.count} 张
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 px-4 py-3.5">
                <div className="font-display text-sm font-semibold text-[#222222]">{preset.title}</div>
                <div className="line-clamp-2 text-sm leading-6 text-[#45515e]">{preset.hint}</div>
                <div className="border-t border-[#f2f3f5] pt-2 text-xs font-medium text-[#1456f0]">套用这个预设</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
