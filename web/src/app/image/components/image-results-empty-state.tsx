import { ArrowUpRight, Sparkles } from "lucide-react";

import type { ImagePromptPreset } from "@/app/image/image-presets";

type ImageResultsEmptyStateProps = {
  promptPresets: readonly ImagePromptPreset[];
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
};

export function ImageResultsEmptyState({
  promptPresets,
  onApplyPromptPreset,
}: ImageResultsEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-1 py-4 sm:min-h-[380px] sm:py-6">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
        <div className="mx-auto flex max-w-[560px] flex-col items-center text-center">
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            <span>AI 多模态创作工作台</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            输入画面描述，开启灵感创作
          </h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">
            在下方输入框描述构图与光影细节、拖拽上传参考图，或点击下方精选模版一键填入。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {promptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="group flex flex-col overflow-hidden rounded-xl border border-border/75 bg-card p-2 text-left shadow-2xs transition-all hover:border-primary/45 hover:shadow-sm"
              onClick={() => void onApplyPromptPreset(preset)}
              aria-label={`套用预设：${preset.title}`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
                <img
                  src={preset.imageSrc}
                  alt={preset.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pt-6 pb-2">
                  <span className="rounded-md bg-background/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground shadow-2xs">
                    {preset.size || "Auto"}
                  </span>
                  <span className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                    {preset.count} 张
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-1.5 px-1.5 pt-2.5 pb-1">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary">
                      {preset.title}
                    </span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {preset.hint}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
