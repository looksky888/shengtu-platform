import { useMemo } from "react";

import {
  MAX_GIF_FRAME_COUNT,
  MAX_GIF_FRAME_DURATION_MS,
  MIN_GIF_FRAME_COUNT,
  MIN_GIF_FRAME_DURATION_MS,
  normalizeGifFrameCount,
  normalizeGifFrameDurationMs,
  sanitizeGifPositiveIntInput,
} from "@/app/image/lib/image-turn-utils";
import { IMAGE_OUTPUT_FORMAT_OPTIONS, supportsGifOutputModel, type ImageOutputFormat } from "@/lib/api";
import { normalizeStringArray } from "@/lib/model-catalog-normalizers";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComposerOutputSettingsProps = {
  imageModel?: string;
  imageFormats?: string[];
  imageOutputFormat: ImageOutputFormat;
  imageOutputFormatLabel: string;
  imageOutputCompression: string;
  imageFrameCount: string;
  imageFrameDurationMs: string;
  compressionDisabled: boolean;
  onImageOutputFormatChange: (value: ImageOutputFormat) => void;
  onImageOutputCompressionChange: (value: string) => void;
  onImageFrameCountChange: (value: string) => void;
  onImageFrameDurationMsChange: (value: string) => void;
};

export function ComposerOutputSettings({
  imageModel = "",
  imageFormats,
  imageOutputFormat,
  imageOutputFormatLabel,
  imageOutputCompression,
  imageFrameCount,
  imageFrameDurationMs,
  compressionDisabled,
  onImageOutputFormatChange,
  onImageOutputCompressionChange,
  onImageFrameCountChange,
  onImageFrameDurationMsChange,
}: ComposerOutputSettingsProps) {
  const configuredFormats = useMemo(
    () => normalizeStringArray(imageFormats).map((item) => item.toLowerCase()),
    [imageFormats],
  );
  const availableOutputFormats = useMemo(() => {
    if (configuredFormats.length > 0) {
      const matched = IMAGE_OUTPUT_FORMAT_OPTIONS.filter((option) => configuredFormats.includes(option.value));
      if (matched.length > 0) return matched;
    }
    return IMAGE_OUTPUT_FORMAT_OPTIONS.filter(
      (option) => option.value !== "gif" || supportsGifOutputModel(imageModel),
    );
  }, [configuredFormats, imageModel]);

  const parsedFrameCount = normalizeGifFrameCount(imageFrameCount);
  const parsedFrameDurationMs = normalizeGifFrameDurationMs(imageFrameDurationMs);
  const outputPreviewText =
    imageOutputFormat === "gif"
      ? [
          imageOutputFormatLabel,
          parsedFrameCount ? `${parsedFrameCount}帧` : "",
          parsedFrameDurationMs ? `${parsedFrameDurationMs}ms` : "",
        ]
          .filter(Boolean)
          .join(" / ")
      : compressionDisabled || !imageOutputCompression.trim()
        ? imageOutputFormatLabel
        : `${imageOutputFormatLabel} / ${imageOutputCompression.trim()}`;

  return (
    <>
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70">
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">格式</span>
        <select
          value={imageOutputFormat}
          onChange={(event) => {
            const nextFormat = event.target.value as ImageOutputFormat;
            onImageOutputFormatChange(nextFormat);
            if (nextFormat !== "gif") {
              onImageFrameCountChange("");
              onImageFrameDurationMsChange("");
            }
            if (nextFormat === "png" || nextFormat === "gif") {
              onImageOutputCompressionChange("");
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-[#18181b] outline-none dark:text-foreground"
          aria-label="图片输出格式"
        >
          {availableOutputFormats.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label
        className={cn(
          "flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70",
          compressionDisabled && "opacity-55",
        )}
        title={compressionDisabled ? "PNG / GIF 不支持压缩率参数" : "JPEG / WebP 压缩率，0-100"}
      >
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">压缩率</span>
        <Input
          aria-label="图片压缩率"
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={imageOutputCompression}
          onChange={(event) => onImageOutputCompressionChange(event.target.value)}
          disabled={compressionDisabled}
          placeholder={compressionDisabled ? "N/A" : "0-100"}
          className="h-7 w-[4.25rem] border-0 bg-transparent px-0 text-right text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 disabled:cursor-not-allowed dark:text-foreground"
        />
      </label>
      <div className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 text-[11px] dark:border-border dark:bg-background/70">
        <span className="shrink-0 font-medium text-[#45515e] dark:text-muted-foreground">输出</span>
        <span className="min-w-0 truncate text-right text-xs font-semibold text-[#18181b] dark:text-foreground">
          {outputPreviewText}
        </span>
      </div>
      {imageOutputFormat === "gif" ? (
        <>
          <label className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-xs dark:border-border dark:bg-background/70">
            <span className="shrink-0 text-[11px] font-medium text-[#45515e] dark:text-muted-foreground">帧数</span>
            <Input
              aria-label="GIF 帧数"
              type="number"
              inputMode="numeric"
              min={MIN_GIF_FRAME_COUNT}
              max={MAX_GIF_FRAME_COUNT}
              step={1}
              value={imageFrameCount}
              placeholder="自动"
              onChange={(event) => onImageFrameCountChange(sanitizeGifPositiveIntInput(event.target.value))}
              onBlur={() => {
                if (!imageFrameCount.trim()) return;
                const normalized = normalizeGifFrameCount(imageFrameCount);
                onImageFrameCountChange(normalized ? String(normalized) : "");
              }}
              className="h-7 w-[4.25rem] border-0 bg-transparent px-0 text-right text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 dark:text-foreground"
            />
          </label>
          <label className="flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 text-xs dark:border-border dark:bg-background/70">
            <span className="shrink-0 text-[11px] font-medium text-[#45515e] dark:text-muted-foreground">间隔</span>
            <Input
              aria-label="GIF 帧间隔毫秒"
              type="number"
              inputMode="numeric"
              min={MIN_GIF_FRAME_DURATION_MS}
              max={MAX_GIF_FRAME_DURATION_MS}
              step={10}
              value={imageFrameDurationMs}
              placeholder="自动ms"
              onChange={(event) => onImageFrameDurationMsChange(sanitizeGifPositiveIntInput(event.target.value))}
              onBlur={() => {
                if (!imageFrameDurationMs.trim()) return;
                const normalized = normalizeGifFrameDurationMs(imageFrameDurationMs);
                onImageFrameDurationMsChange(normalized ? String(normalized) : "");
              }}
              className="h-7 w-[4.5rem] border-0 bg-transparent px-0 text-right text-xs font-semibold text-[#18181b] shadow-none focus-visible:ring-0 dark:text-foreground"
            />
          </label>
        </>
      ) : null}
    </>
  );
}
