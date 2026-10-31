import { useMemo, useState } from "react";
import { ChevronDown, Coins, Minus, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";

import type { ComposerSettingsPopoverProps } from "@/app/image/components/composer-settings-types";
import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_CUSTOM_HEIGHT,
  DEFAULT_IMAGE_CUSTOM_WIDTH,
  GPT_IMAGE_RESOLUTION_OPTIONS,
  GROK_IMAGE_RESOLUTION_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  buildImageSize,
  formatImageSizeDisplay,
  parseImageRatio,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
} from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import { DEFAULT_IMAGE_OUTPUT_FORMAT, DEFAULT_IMAGE_QUALITY } from "@/app/image/lib/image-page-types";
import {
  MAX_IMAGE_COUNT,
  MIN_IMAGE_COUNT,
  normalizeRequestedImageCount,
  sanitizeImageCountInput,
} from "@/app/image/lib/image-turn-utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IMAGE_OUTPUT_FORMAT_OPTIONS, isGrokImageModel, type ImageOutputFormat, type ImageQuality } from "@/lib/api";
import { normalizeStringArray } from "@/lib/model-catalog-normalizers";
import { cn } from "@/lib/utils";

const COUNT_PILL_OPTIONS = ["1", "2", "4", "8", "15"] as const;

const SIZE_MODE_PILLS: ReadonlyArray<{ value: ImageSizeMode; label: string }> = [
  { value: "auto", label: "自适应" },
  { value: "ratio", label: "按比例" },
  { value: "custom", label: "自定义像素" },
];

const STANDARD_ASPECT_RATIOS: ReadonlyArray<{
  value: ImageAspectRatio;
  label: string;
  frameClass: string;
  grokUnsupported?: boolean;
}> = [
  { value: "", label: "Auto", frameClass: "h-3 w-3.5 border-dashed" },
  { value: "1:1", label: "1:1", frameClass: "size-3" },
  { value: "16:9", label: "16:9", frameClass: "h-2.5 w-4" },
  { value: "9:16", label: "9:16", frameClass: "h-4 w-2.5" },
  { value: "4:3", label: "4:3", frameClass: "h-2.5 w-3.5" },
  { value: "3:4", label: "3:4", frameClass: "h-3.5 w-2.5" },
  { value: "3:2", label: "3:2", frameClass: "h-2.5 w-[15px]" },
  { value: "2:3", label: "2:3", frameClass: "h-[15px] w-2.5" },
  { value: "21:9", label: "21:9", frameClass: "h-2 w-[18px]", grokUnsupported: true },
  { value: CUSTOM_IMAGE_ASPECT_RATIO, label: "自定义", frameClass: "h-3 w-3.5 border-dotted", grokUnsupported: true },
];

const CUSTOM_PIXEL_PRESETS = [
  { label: "1024×1024", width: "1024", height: "1024" },
  { label: "1536×1024", width: "1536", height: "1024" },
  { label: "1024×1536", width: "1024", height: "1536" },
] as const;

const SHORT_RESOLUTION_LABELS: Record<ImageResolution, string> = {
  auto: "Auto",
  "1k": "1K",
  "1080p": "1080P",
  "2k": "2K",
  "4k": "4K",
};

const QUALITY_STUDIO_LABELS: Record<ImageQuality, string> = {
  low: "草图 Low",
  medium: "标准 Medium",
  high: "高清 High",
};

export function ComposerSettingsPopover(props: ComposerSettingsPopoverProps) {
  const {
    isOpen,
    imageModel = "",
    imageCount,
    imageSizeMode,
    imageAspectRatio,
    imageResolution,
    imageCustomRatio,
    imageCustomWidth,
    imageCustomHeight,
    imageQuality,
    imageQualityOptions,
    imageOutputFormat,
    imageOutputCompression,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    onOpenChange,
    onCloseModelMenu,
    onImageCountChange,
    onImageSizeModeChange,
    onImageAspectRatioChange,
    onImageResolutionChange,
    onImageCustomRatioChange,
    onImageCustomWidthChange,
    onImageCustomHeightChange,
    onImageQualityChange,
    onImageOutputFormatChange,
    onImageOutputCompressionChange,
  } = props;

  const computedImageSize = useMemo(
    () =>
      buildImageSize({
        mode: imageSizeMode,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        customRatio: imageCustomRatio,
        customWidth: imageCustomWidth,
        customHeight: imageCustomHeight,
      }),
    [imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSizeMode],
  );

  const grokMode = isGrokImageModel(imageModel);
  const ratioTiles = useMemo(
    () =>
      grokMode
        ? STANDARD_ASPECT_RATIOS.filter((tile) => !tile.grokUnsupported)
        : STANDARD_ASPECT_RATIOS,
    [grokMode],
  );
  const configuredResolutions = normalizeStringArray(props.imageResolutions);
  const resolutionOptions = configuredResolutions.length
    ? IMAGE_RESOLUTION_OPTIONS.filter((option) =>
        configuredResolutions.includes(option.value === "1080p" ? "1k" : option.value),
      )
    : grokMode
      ? GROK_IMAGE_RESOLUTION_OPTIONS
      : GPT_IMAGE_RESOLUTION_OPTIONS;

  const defaultResolution: ImageResolution = grokMode
    ? "auto"
    : (resolutionOptions[0]?.value ?? "1k");

  const isCustomRatioInvalid =
    imageSizeMode === "ratio" &&
    imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO &&
    !parseImageRatio(imageCustomRatio);

  const paidPoolRestricted = props.imageChannelType === "account_pool";
  const paidSizeUnavailable = paidPoolRestricted && requiresPaidAccountImageSize(computedImageSize);

  const requiresPaidForSelection = (aspectRatio: ImageAspectRatio, resolution: ImageResolution) =>
    paidPoolRestricted &&
    requiresPaidAccountImageSize(
      buildImageSize({
        mode: "ratio",
        aspectRatio,
        resolution,
        customRatio: imageCustomRatio,
        customWidth: DEFAULT_IMAGE_CUSTOM_WIDTH,
        customHeight: DEFAULT_IMAGE_CUSTOM_HEIGHT,
      }),
    );

  const triggerSizeLabel = computedImageSize
    ? formatImageSizeDisplay(computedImageSize)
    : imageSizeMode === "ratio" && imageAspectRatio && imageAspectRatio !== CUSTOM_IMAGE_ASPECT_RATIO
      ? imageAspectRatio
      : "自适应";

  const telemetryLeftText = paidSizeUnavailable
    ? "本地号池不支持该大尺寸"
    : isCustomRatioInvalid
      ? "比例格式需为 宽:高"
      : computedImageSize
        ? `输出: ${formatImageSizeDisplay(computedImageSize)}`
        : imageSizeMode === "ratio" && imageAspectRatio && imageAspectRatio !== CUSTOM_IMAGE_ASPECT_RATIO
          ? `输出: ${imageAspectRatio} 画幅`
          : "输出: 自适应尺寸";

  const compressionDisabled = imageOutputFormat === "png";
  const supportsQuality = imageQualityOptions.length > 0;
  const resolvedCompressionNumber = useMemo(() => {
    const num = Number.parseInt(imageOutputCompression, 10);
    if (!Number.isFinite(num) || num < 10 || num > 100) return 85;
    return num;
  }, [imageOutputCompression]);

  const hasNonDefaultAdvanced =
    imageSizeMode === "custom" ||
    (supportsQuality && imageQuality !== DEFAULT_IMAGE_QUALITY) ||
    imageOutputFormat !== DEFAULT_IMAGE_OUTPUT_FORMAT ||
    Boolean(imageOutputCompression.trim());

  const [manualAdvancedOpen, setManualAdvancedOpen] = useState<boolean | null>(null);
  const isAdvancedOpen = manualAdvancedOpen ?? hasNonDefaultAdvanced;

  const advancedSummary = useMemo(() => {
    const parts: string[] = [];
    if (imageSizeMode === "custom") {
      parts.push(`${imageCustomWidth || DEFAULT_IMAGE_CUSTOM_WIDTH}×${imageCustomHeight || DEFAULT_IMAGE_CUSTOM_HEIGHT}`);
    }
    if (supportsQuality) {
      parts.push(imageQuality === "low" ? "Low" : imageQuality === "medium" ? "Medium" : "High");
    }
    parts.push(
      compressionDisabled
        ? imageOutputFormat.toUpperCase()
        : `${imageOutputFormat.toUpperCase()} ${resolvedCompressionNumber}%`,
    );
    return parts.join(" · ");
  }, [
    compressionDisabled,
    imageCustomHeight,
    imageCustomWidth,
    imageOutputFormat,
    imageQuality,
    imageSizeMode,
    resolvedCompressionNumber,
    supportsQuality,
  ]);

  const normalizedCount = normalizeRequestedImageCount(imageCount);

  const isAtDefault =
    normalizedCount === 1 &&
    imageSizeMode === "auto" &&
    imageAspectRatio === "" &&
    imageResolution === defaultResolution &&
    (!supportsQuality || imageQuality === DEFAULT_IMAGE_QUALITY) &&
    imageOutputFormat === DEFAULT_IMAGE_OUTPUT_FORMAT &&
    !imageOutputCompression.trim();

  const handleResetDefaults = () => {
    onImageCountChange("1");
    onImageSizeModeChange("auto");
    onImageAspectRatioChange("");
    onImageResolutionChange(defaultResolution);
    if (supportsQuality) {
      onImageQualityChange(DEFAULT_IMAGE_QUALITY);
    }
    onImageOutputFormatChange(DEFAULT_IMAGE_OUTPUT_FORMAT);
    onImageOutputCompressionChange("");
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        if (next) {
          onCloseModelMenu();
        } else if (!String(imageCount).trim()) {
          onImageCountChange(String(normalizedCount));
        }
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-surface-hover hover:text-foreground",
            isOpen && "bg-surface-active text-foreground ring-1 ring-foreground/15",
          )}
          aria-label={isOpen ? "收起参数设置" : "显示更多参数设置"}
          aria-expanded={isOpen}
          title={isOpen ? "收起参数" : "生成参数配置"}
        >
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">参数</span>
          <span className="hidden text-muted-foreground/50 sm:inline">·</span>
          <span className="font-mono text-[11px] font-medium text-foreground/90 tabular-nums">
            {triggerSizeLabel} · {normalizedCount}张
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className="z-[70] max-h-[min(calc(100dvh-1.5rem),38rem)] w-[min(calc(100vw-1rem),356px)] overflow-y-auto overflow-x-hidden rounded-2xl border-border/85 bg-surface p-3.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.16)] sm:w-[388px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-3">
          {/* 1. Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border/65 pb-2.5">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold tracking-tight text-foreground">
                基础画幅与输出
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={isAtDefault}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <RotateCcw className="size-3" />
              <span>恢复默认</span>
            </button>
          </div>

          {/* 2. 生成张数 (count: 1–15 自由输入 + 快捷档位) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-muted-foreground">生成张数</span>
              <span className="font-mono text-[10px] text-subtle-foreground">
                可填 {MIN_IMAGE_COUNT}–{MAX_IMAGE_COUNT} 张 · 并发批处理
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="grid min-w-0 flex-1 grid-cols-5 gap-1 rounded-xl bg-surface-muted/95 p-1"
                role="radiogroup"
                aria-label="生成张数快捷选择"
              >
                {COUNT_PILL_OPTIONS.map((val) => {
                  const active = String(normalizedCount) === val && String(imageCount).trim() !== "";
                  return (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onImageCountChange(val)}
                      className={cn(
                        "h-7 rounded-lg font-mono text-xs tabular-nums transition-all",
                        active
                          ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                          : "font-medium text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>

              <div className="flex h-9 shrink-0 items-center rounded-xl border border-border/80 bg-surface px-1 shadow-2xs">
                <button
                  type="button"
                  aria-label="减少生成张数"
                  disabled={normalizedCount <= MIN_IMAGE_COUNT}
                  onClick={() => onImageCountChange(String(Math.max(MIN_IMAGE_COUNT, normalizedCount - 1)))}
                  className="inline-flex size-6.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                >
                  <Minus className="size-3" />
                </button>
                <Input
                  aria-label="自定义生成张数"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={imageCount}
                  placeholder={String(normalizedCount)}
                  onChange={(event) => onImageCountChange(sanitizeImageCountInput(event.target.value))}
                  onBlur={() => onImageCountChange(String(normalizedCount))}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      onImageCountChange(String(Math.min(MAX_IMAGE_COUNT, normalizedCount + 1)));
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      onImageCountChange(String(Math.max(MIN_IMAGE_COUNT, normalizedCount - 1)));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      onImageCountChange(String(normalizedCount));
                    }
                  }}
                  className="h-7 w-7 border-0 bg-transparent px-0 text-center font-mono text-xs font-semibold text-foreground tabular-nums shadow-none focus-visible:ring-0"
                />
                <span className="pr-0.5 text-[10px] font-medium text-muted-foreground select-none">张</span>
                <button
                  type="button"
                  aria-label="增加生成张数"
                  disabled={normalizedCount >= MAX_IMAGE_COUNT}
                  onClick={() => onImageCountChange(String(Math.min(MAX_IMAGE_COUNT, normalizedCount + 1)))}
                  className="inline-flex size-6.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. 基础画幅比例 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-muted-foreground">画幅比例</span>
              {imageSizeMode === "custom" ? (
                <button
                  type="button"
                  onClick={() => onImageSizeModeChange("auto")}
                  className="font-mono text-[10px] font-medium text-foreground underline underline-offset-2"
                >
                  自定义像素生效中 · 切回比例
                </button>
              ) : (
                <span className="font-mono text-[10px] text-subtle-foreground">
                  {imageSizeMode === "auto" ? "自动构图" : "锁定画幅"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="画幅比例">
              {ratioTiles.map((tile) => {
                const isAutoTile = tile.value === "";
                const active = isAutoTile
                  ? imageSizeMode === "auto" || (imageSizeMode === "ratio" && imageAspectRatio === "")
                  : imageSizeMode === "ratio" && imageAspectRatio === tile.value;
                const disabled =
                  !isAutoTile &&
                  tile.value !== CUSTOM_IMAGE_ASPECT_RATIO &&
                  requiresPaidForSelection(tile.value, imageResolution);

                return (
                  <button
                    key={tile.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    title={disabled ? "本地号池已禁用需要 Paid 账号的大尺寸" : `选择 ${tile.label} 画幅`}
                    onClick={() => {
                      if (isAutoTile) {
                        onImageSizeModeChange("auto");
                        onImageAspectRatioChange("");
                        return;
                      }
                      if (imageSizeMode !== "ratio") {
                        onImageSizeModeChange("ratio");
                      }
                      onImageAspectRatioChange(tile.value);
                    }}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 transition-all active:scale-[0.98]",
                      active
                        ? "border-foreground bg-surface font-semibold text-foreground shadow-xs ring-1 ring-foreground/15 dark:bg-zinc-800/90"
                        : "border-border/75 bg-surface-muted/55 text-muted-foreground hover:border-border-strong hover:bg-surface-hover hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-40 hover:bg-surface-muted/55",
                    )}
                  >
                    <span className={cn("rounded-[2px] border border-current", tile.frameClass)} />
                    <span className="font-mono text-[11px] leading-none tabular-nums">
                      {tile.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {!grokMode && imageSizeMode === "ratio" && (imageAspectRatio === "21:9" || imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO) ? (
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border bg-surface-muted/75 px-3 py-1.5",
                  isCustomRatioInvalid ? "border-rose-400/70" : "border-border/75",
                )}
              >
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  {imageAspectRatio === "21:9" ? "当前比例 21:9" : "自定义比例"}
                </span>
                {imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO ? (
                  <Input
                    aria-label="自定义图片比例"
                    value={imageCustomRatio}
                    onChange={(event) => onImageCustomRatioChange(event.target.value)}
                    placeholder="如 5:4 / 21:9"
                    className="h-6 border-0 bg-transparent px-0 text-right font-mono text-xs font-semibold text-foreground shadow-none focus-visible:ring-0"
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 4. 分辨率档位 */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-muted-foreground">分辨率档位</span>
            <div
              className="grid gap-1 rounded-xl bg-surface-muted/95 p-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, resolutionOptions.length)}, minmax(0, 1fr))` }}
              role="radiogroup"
              aria-label="分辨率档位"
            >
              {resolutionOptions.map((option) => {
                const active = imageResolution === option.value;
                const disabled =
                  imageSizeMode === "ratio" &&
                  requiresPaidForSelection(imageAspectRatio, option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    title={disabled ? "本地号池已禁用该分辨率组合" : option.label}
                    onClick={() => onImageResolutionChange(option.value)}
                    className={cn(
                      "h-7 rounded-lg font-mono text-[11px] tabular-nums transition-all",
                      active
                        ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                        : "font-medium text-muted-foreground hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {SHORT_RESOLUTION_LABELS[option.value] || option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 可折叠「高级输出」 */}
          <div className="rounded-xl border border-border/70 bg-surface-subtle/55">
            <button
              type="button"
              aria-expanded={isAdvancedOpen}
              onClick={() => setManualAdvancedOpen(!isAdvancedOpen)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] transition-colors hover:bg-surface-hover/60"
            >
              <span className="flex items-center gap-1.5 font-medium text-foreground/90">
                <span>高级输出</span>
                {hasNonDefaultAdvanced ? (
                  <span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span>{advancedSummary}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    isAdvancedOpen && "rotate-180",
                  )}
                />
              </span>
            </button>

            {isAdvancedOpen ? (
              <div className="space-y-3 border-t border-border/60 px-3 pt-2.5 pb-3">
                {/* 尺寸模式与自定义像素 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">尺寸模式</span>
                    <div
                      className="grid grid-cols-3 gap-0.5 rounded-lg bg-surface-muted/95 p-0.5"
                      role="tablist"
                      aria-label="尺寸模式"
                    >
                      {SIZE_MODE_PILLS.map((modeOption) => {
                        const active = imageSizeMode === modeOption.value;
                        return (
                          <button
                            key={modeOption.value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => {
                              onImageSizeModeChange(modeOption.value);
                              if (modeOption.value === "ratio" && !imageAspectRatio) {
                                onImageAspectRatioChange("1:1");
                              }
                            }}
                            className={cn(
                              "h-6 rounded-md px-2 text-[11px] transition-all",
                              active
                                ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {modeOption.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {imageSizeMode === "custom" ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-border/75 bg-surface px-3 py-1.5">
                        <label className="flex min-w-0 items-center justify-between gap-1.5">
                          <span className="text-[10px] text-muted-foreground">宽</span>
                          <Input
                            aria-label="手动输入宽度"
                            type="number"
                            inputMode="numeric"
                            min="256"
                            step="64"
                            value={imageCustomWidth}
                            onChange={(event) => onImageCustomWidthChange(event.target.value)}
                            className="h-7 min-w-0 border-0 bg-transparent px-0 text-right font-mono text-xs font-semibold text-foreground shadow-none focus-visible:ring-0"
                          />
                        </label>
                        <X className="size-3 shrink-0 text-subtle-foreground" />
                        <label className="flex min-w-0 items-center justify-between gap-1.5">
                          <span className="text-[10px] text-muted-foreground">高</span>
                          <Input
                            aria-label="手动输入高度"
                            type="number"
                            inputMode="numeric"
                            min="256"
                            step="64"
                            value={imageCustomHeight}
                            onChange={(event) => onImageCustomHeightChange(event.target.value)}
                            className="h-7 min-w-0 border-0 bg-transparent px-0 text-right font-mono text-xs font-semibold text-foreground shadow-none focus-visible:ring-0"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {CUSTOM_PIXEL_PRESETS.map((preset) => {
                          const active = imageCustomWidth === preset.width && imageCustomHeight === preset.height;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                onImageCustomWidthChange(preset.width);
                                onImageCustomHeightChange(preset.height);
                              }}
                              className={cn(
                                "flex-1 rounded-lg border py-1 font-mono text-[10px] tabular-nums transition-colors",
                                active
                                  ? "border-foreground/70 bg-surface font-semibold text-foreground"
                                  : "border-border/70 bg-surface-muted/50 text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* 渲染画质 */}
                {supportsQuality ? (
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-muted-foreground">渲染画质</span>
                    <div
                      className="grid gap-1 rounded-xl bg-surface-muted/95 p-1"
                      style={{ gridTemplateColumns: `repeat(${imageQualityOptions.length}, minmax(0, 1fr))` }}
                      role="radiogroup"
                      aria-label="渲染画质"
                    >
                      {imageQualityOptions.map((option) => {
                        const active = imageQuality === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            title={option.description}
                            onClick={() => onImageQualityChange(option.value)}
                            className={cn(
                              "h-7 rounded-lg px-1.5 text-[11px] transition-all",
                              active
                                ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <span className="truncate">{QUALITY_STUDIO_LABELS[option.value] || option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* 输出格式 & 压缩滑杆 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">输出格式</span>
                    <span className="font-mono text-[10px] text-subtle-foreground">
                      {compressionDisabled ? "无损透明通道" : `有损压缩 · ${resolvedCompressionNumber}%`}
                    </span>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted/95 p-1"
                    role="radiogroup"
                    aria-label="输出格式"
                  >
                    {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => {
                      const active = imageOutputFormat === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            const nextFormat = option.value as ImageOutputFormat;
                            onImageOutputFormatChange(nextFormat);
                            if (nextFormat === "png") {
                              onImageOutputCompressionChange("");
                            } else if (!imageOutputCompression.trim()) {
                              onImageOutputCompressionChange("85");
                            }
                          }}
                          className={cn(
                            "h-7 rounded-lg font-mono text-xs transition-all",
                            active
                              ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.05] dark:bg-zinc-800 dark:ring-white/[0.1]"
                              : "font-medium text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.value.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  {!compressionDisabled ? (
                    <div className="flex items-center gap-3 rounded-xl bg-surface-muted/65 px-3 py-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">画质压缩</span>
                      <input
                        type="range"
                        aria-label="图片压缩质量"
                        min={10}
                        max={100}
                        step={1}
                        value={resolvedCompressionNumber}
                        onChange={(event) => onImageOutputCompressionChange(event.target.value)}
                        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground"
                      />
                      <span className="w-9 shrink-0 text-right font-mono text-[11px] font-semibold text-foreground tabular-nums">
                        {resolvedCompressionNumber}%
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* 6. Compact 1-Line Studio Telemetry Footer */}
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] tabular-nums",
              paidSizeUnavailable || isCustomRatioInvalid
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "bg-surface-muted/80 text-muted-foreground",
            )}
            title={estimatedCreditCostDetail}
          >
            <span className="min-w-0 truncate font-mono font-medium">
              {telemetryLeftText}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 font-mono font-semibold text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/12 dark:text-amber-300">
              <Coins className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              扣除 {estimatedCreditCost} 积分
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
