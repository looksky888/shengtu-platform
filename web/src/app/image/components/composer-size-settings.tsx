import { X } from "lucide-react";

import { IMAGE_SIZE_MODE_OPTIONS, type ImageSizeMode } from "@/app/image/image-options";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComposerSizeSettingsProps = {
  imageCount: string;
  sizePreviewLabel: string;
  imageSizeMode: ImageSizeMode;
  imageCustomWidth: string;
  imageCustomHeight: string;
  onImageCountChange: (value: string) => void;
  onImageSizeModeChange: (value: ImageSizeMode) => void;
  onImageCustomWidthChange: (value: string) => void;
  onImageCustomHeightChange: (value: string) => void;
  onCloseNestedMenus: () => void;
};

export function ComposerSizeSettings({
  imageCount,
  sizePreviewLabel,
  imageSizeMode,
  imageCustomWidth,
  imageCustomHeight,
  onImageCountChange,
  onImageSizeModeChange,
  onImageCustomWidthChange,
  onImageCustomHeightChange,
  onCloseNestedMenus,
}: ComposerSizeSettingsProps) {
  return (
    <>
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 dark:border-border dark:bg-background/70">
        <span className="shrink-0 text-[11px] font-medium text-[#45515e] dark:text-muted-foreground">张数</span>
        <Input
          aria-label="生成张数"
          type="number"
          inputMode="numeric"
          min="1"
          max="10"
          step="1"
          value={imageCount}
          onChange={(event) => onImageCountChange(event.target.value)}
          className="h-7 w-[36px] border-0 bg-transparent px-0 text-center text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 dark:text-foreground"
        />
      </div>
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70">
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">尺寸</span>
        <span className="min-w-0 truncate text-right text-xs font-semibold text-[#18181b] dark:text-foreground">
          {sizePreviewLabel}
        </span>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-1 rounded-full border border-[#e5e7eb] bg-white p-1 dark:border-border dark:bg-background/70 sm:col-span-3">
        {IMAGE_SIZE_MODE_OPTIONS.map((option) => {
          const active = option.value === imageSizeMode;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "h-7 min-w-0 rounded-full px-2 text-xs font-medium text-[#45515e] transition hover:bg-black/[0.05] dark:text-muted-foreground dark:hover:bg-accent/60",
                active && "bg-[#181e25] text-white hover:bg-[#181e25] dark:bg-foreground dark:text-background",
              )}
              onClick={() => {
                onImageSizeModeChange(option.value);
                onCloseNestedMenus();
              }}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {imageSizeMode === "custom" ? (
        <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 dark:border-border dark:bg-background/70 sm:col-span-3">
          <label className="min-w-0">
            <span className="sr-only">手动输入宽度</span>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={imageCustomWidth}
              onChange={(event) => onImageCustomWidthChange(event.target.value)}
              className="h-8 min-w-0 border-0 bg-transparent px-0 text-center text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 dark:text-foreground"
            />
          </label>
          <X className="size-3.5 shrink-0 text-[#8e8e93]" />
          <label className="min-w-0">
            <span className="sr-only">手动输入高度</span>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={imageCustomHeight}
              onChange={(event) => onImageCustomHeightChange(event.target.value)}
              className="h-8 min-w-0 border-0 bg-transparent px-0 text-center text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 dark:text-foreground"
            />
          </label>
        </div>
      ) : null}
    </>
  );
}
