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
            "inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-surface-hover hover:text-foreground",
            isOpen && "bg-surface-active text-foreground ring-1 ring-foreground/15",
          )}
          aria-label={isOpen ? "收起参数设置" : "显示更多参数设置"}
          aria-expanded={isOpen}
          title={isOpen ? "收起参数" : "更多参数"}
        >
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">参数</span>
          <span className="hidden text-muted-foreground/50 sm:inline">·</span>
          <span className="font-mono text-[11px] font-medium text-foreground/90 tabular-nums">
            {sizePreviewLabel} · {imageCount}张
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="z-[70] max-h-[min(calc(100dvh-2rem),34rem)] w-[min(calc(100vw-1rem),28rem)] overflow-y-auto overflow-x-hidden rounded-xl border-border/85 bg-surface p-3 shadow-xl sm:w-[min(calc(100vw-2rem),28rem)] sm:overflow-visible"
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
          {imageSizeMode === "custom" || imageSizeMode === "auto" ? (
            <ComposerSettingsInfoCard title="计算后分辨率" value={sizePreviewLabel} detail={sizePreviewDetail} />
          ) : null}
          <ComposerSettingsInfoCard
            title="预计积分"
            value={`${estimatedCreditCost} 积分`}
            detail={estimatedCreditCostDetail}
            variant="credit"
          />
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
