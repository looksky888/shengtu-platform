import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";

import { ComposerOutputSettings } from "@/app/image/components/composer-output-settings";
import { ComposerQualitySettings } from "@/app/image/components/composer-quality-settings";
import { ComposerRatioResolutionSettings } from "@/app/image/components/composer-ratio-resolution-settings";
import { ComposerSettingsInfoCard } from "@/app/image/components/composer-settings-info-card";
import { ComposerSizeSettings } from "@/app/image/components/composer-size-settings";
import type { ComposerSettingsPopoverProps } from "@/app/image/components/composer-settings-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  GPT_IMAGE_RESOLUTION_OPTIONS,
  GROK_IMAGE_ASPECT_RATIO_OPTIONS,
  GROK_IMAGE_RESOLUTION_OPTIONS,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  buildImageSize,
  formatImageSizeDisplay,
  getActiveImageAspectRatio,
  parseImageRatio,
} from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import { IMAGE_OUTPUT_FORMAT_OPTIONS, isGrokImageModel } from "@/lib/api";
import { normalizeStringArray } from "@/lib/model-catalog-normalizers";
import { cn } from "@/lib/utils";

export function ComposerSettingsPopover(props: ComposerSettingsPopoverProps) {
  const {
    isOpen,
    imageModel,
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
    onAspectRatioMenuOpenChange,
    onResolutionMenuOpenChange,
    onQualityMenuOpenChange,
    onImageCountChange,
    onImageSizeModeChange,
    onImageCustomWidthChange,
    onImageCustomHeightChange,
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
  const activeImageAspectRatio = getActiveImageAspectRatio({ aspectRatio: imageAspectRatio, customRatio: imageCustomRatio });
  const isCustomRatioInvalid =
    imageSizeMode === "ratio" && imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO && !parseImageRatio(imageCustomRatio);
  const paidSizeUnavailable = props.imageChannelType === "account_pool"
    && requiresPaidAccountImageSize(computedImageSize);
  const sizePreviewLabel = computedImageSize
    ? formatImageSizeDisplay(computedImageSize)
    : imageSizeMode === "auto" || (imageSizeMode === "ratio" && imageResolution === "auto" && !isCustomRatioInvalid)
      ? "Auto"
      : "尺寸无效";
  const sizePreviewDetail = paidSizeUnavailable
    ? "本地号池已禁用需要 Paid 账号的大尺寸，请选择标准尺寸"
    : imageSizeMode === "ratio"
      ? isCustomRatioInvalid
        ? "比例需要填写为宽:高"
        : imageResolution === "auto"
          ? activeImageAspectRatio
            ? `将按 ${activeImageAspectRatio} 比例下发`
            : "Auto 比例将交给模型决定"
          : computedImageSize
            ? `将下发计算后的 ${formatImageSizeDisplay(computedImageSize)}`
            : "比例需要填写为宽:高"
      : imageSizeMode === "custom"
        ? computedImageSize
          ? `已按链路限制校准为 ${formatImageSizeDisplay(computedImageSize)}`
          : "宽高需要填写正整数"
        : "不会强制指定尺寸";
  const grokMode = isGrokImageModel(imageModel);
  const aspectOptions = grokMode ? GROK_IMAGE_ASPECT_RATIO_OPTIONS : IMAGE_ASPECT_RATIO_OPTIONS;
  const configuredResolutions = normalizeStringArray(props.imageResolutions);
  const resolutionOptions = configuredResolutions.length
    ? IMAGE_RESOLUTION_OPTIONS.filter((option) => configuredResolutions.includes(option.value === "1080p" ? "1k" : option.value))
    : grokMode ? GROK_IMAGE_RESOLUTION_OPTIONS : GPT_IMAGE_RESOLUTION_OPTIONS;
  const imageAspectRatioLabel =
    imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO
      ? imageCustomRatio.trim() || "自定义比例"
      : aspectOptions.find((option) => option.value === imageAspectRatio)?.label || "Auto";
  const imageResolutionLabel =
    resolutionOptions.find((option) => option.value === imageResolution)?.label || "Auto";
  const imageQualityLabel = imageQualityOptions.find((option) => option.value === imageQuality)?.label || imageQuality;
  const imageOutputFormatLabel =
    IMAGE_OUTPUT_FORMAT_OPTIONS.find((option) => option.value === imageOutputFormat)?.label || imageOutputFormat.toUpperCase();
  const compressionDisabled = imageOutputFormat === "png";
  const supportsQuality = imageQualityOptions.length > 0;
  const closeNestedMenus = () => {
    onAspectRatioMenuOpenChange(false);
    onResolutionMenuOpenChange(false);
    onQualityMenuOpenChange(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-[#686b73] transition hover:bg-black/[0.05] dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground sm:h-8 sm:w-auto sm:border sm:border-[#e5e7eb] sm:bg-white sm:px-3 sm:text-xs sm:font-medium sm:text-[#45515e] sm:dark:border-border sm:dark:bg-background/70 sm:dark:text-muted-foreground",
            isOpen && "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300 sm:border-[#bfdbfe] sm:bg-[#eef4ff] sm:text-[#1456f0] sm:dark:border-sky-900/70 sm:dark:bg-sky-950/30 sm:dark:text-sky-300",
          )}
          aria-label={isOpen ? "收起参数设置" : "显示更多参数设置"}
          aria-expanded={isOpen}
          title={isOpen ? "收起参数" : "更多参数"}
        >
          <SlidersHorizontal className="size-5 sm:size-3.5" />
          <span className="hidden sm:inline">参数</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="z-[70] max-h-[min(calc(100dvh-2rem),34rem)] w-[min(calc(100vw-1rem),28rem)] overflow-y-auto overflow-x-hidden rounded-[20px] border-[#e5e7eb] bg-white p-2.5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] dark:border-border dark:bg-card dark:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.72)] sm:w-[min(calc(100vw-2rem),28rem)] sm:overflow-visible"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ComposerSizeSettings
            imageCount={imageCount}
            sizePreviewLabel={sizePreviewLabel}
            imageSizeMode={imageSizeMode}
            imageCustomWidth={imageCustomWidth}
            imageCustomHeight={imageCustomHeight}
            onImageCountChange={onImageCountChange}
            onImageSizeModeChange={onImageSizeModeChange}
            onImageCustomWidthChange={onImageCustomWidthChange}
            onImageCustomHeightChange={onImageCustomHeightChange}
            onCloseNestedMenus={closeNestedMenus}
          />
          <ComposerRatioResolutionSettings
            {...props}
            imageModel={imageModel}
            imageAspectRatioLabel={imageAspectRatioLabel}
            imageResolutionLabel={imageResolutionLabel}
            isCustomRatioInvalid={isCustomRatioInvalid}
            sizePreviewLabel={sizePreviewLabel}
            sizePreviewDetail={sizePreviewDetail}
          />
          {imageSizeMode === "custom" ? (
            <ComposerSettingsInfoCard title="计算后分辨率" value={sizePreviewLabel} detail={sizePreviewDetail} />
          ) : null}
          <ComposerQualitySettings
            {...props}
            supportsQuality={supportsQuality}
            imageQualityLabel={imageQualityLabel}
          />
          <ComposerOutputSettings
            imageOutputFormat={imageOutputFormat}
            imageOutputFormatLabel={imageOutputFormatLabel}
            imageOutputCompression={imageOutputCompression}
            compressionDisabled={compressionDisabled}
            onImageOutputFormatChange={props.onImageOutputFormatChange}
            onImageOutputCompressionChange={props.onImageOutputCompressionChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
