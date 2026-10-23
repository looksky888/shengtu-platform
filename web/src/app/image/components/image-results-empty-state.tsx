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
    <div className="flex h-full min-h-[260px] items-center justify-center px-1 py-4 sm:min-h-[360px] sm:py-6">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
        <div className="mx-auto flex max-w-[540px] flex-col items-center text-center">
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-muted/80 px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            VISUAL CREATION STUDIO
          </span>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            开始新的视觉创作
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            在下方工作台描述构图与光影细节、拖拽上传参考图，或轻点精选画作一键载入提示词。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {promptPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              onClick={() => void onApplyPromptPreset(preset)}
              aria-label={`套用预设：${preset.title}`}
            >
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/75 bg-surface shadow-2xs transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:shadow-md">
                <img
                  src={preset.imageSrc}
                  alt={preset.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className="rounded-md border border-white/15 bg-black/45 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 backdrop-blur-md">
                    {preset.size || "Auto"}
                  </span>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/25 to-transparent p-3 pt-10">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold tracking-tight text-white drop-shadow-xs">
                        {preset.title}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-white/75">
                        {preset.hint}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 translate-y-1 items-center rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 backdrop-blur-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                      填入提示词 ↗
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
