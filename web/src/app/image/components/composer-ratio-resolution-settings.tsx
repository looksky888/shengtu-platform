import type { RefObject } from "react";

import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  GPT_IMAGE_RESOLUTION_OPTIONS,
  GROK_IMAGE_ASPECT_RATIO_OPTIONS,
  GROK_IMAGE_RESOLUTION_OPTIONS,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  buildImageSize,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
} from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import type { ImageChannelType } from "@/lib/image-channel-api";
import { ComposerOptionMenu } from "@/app/image/components/composer-option-menu";
import { ComposerSettingsInfoCard } from "@/app/image/components/composer-settings-info-card";
import { Input } from "@/components/ui/input";
import { isGrokImageModel } from "@/lib/api-models";
import { normalizeStringArray } from "@/lib/model-catalog-normalizers";
import { cn } from "@/lib/utils";

type ComposerRatioResolutionSettingsProps = {
  imageModel?: string;
  imageResolutions?: string[];
  imageChannelType?: ImageChannelType;
  imageSizeMode: ImageSizeMode;
  imageAspectRatio: ImageAspectRatio;
  imageResolution: ImageResolution;
  imageCustomRatio: string;
  imageAspectRatioLabel: string;
  imageResolutionLabel: string;
  isCustomRatioInvalid: boolean;
  sizePreviewLabel: string;
  sizePreviewDetail: string;
  estimatedCreditCost: number;
  estimatedCreditCostDetail: string;
  aspectRatioMenuRef: RefObject<HTMLDivElement | null>;
  resolutionMenuRef: RefObject<HTMLDivElement | null>;
  isAspectRatioMenuOpen: boolean;
  isResolutionMenuOpen: boolean;
  onCloseModelMenu: () => void;
  onAspectRatioMenuOpenChange: (open: boolean) => void;
  onResolutionMenuOpenChange: (open: boolean) => void;
  onQualityMenuOpenChange: (open: boolean) => void;
  onImageAspectRatioChange: (value: ImageAspectRatio) => void;
  onImageResolutionChange: (value: ImageResolution) => void;
  onImageCustomRatioChange: (value: string) => void;
};

export function ComposerRatioResolutionSettings({
  imageModel = "",
  imageResolutions = [],
  imageChannelType,
  imageSizeMode,
  imageAspectRatio,
  imageResolution,
  imageCustomRatio,
  imageAspectRatioLabel,
  imageResolutionLabel,
  isCustomRatioInvalid,
  sizePreviewLabel,
  sizePreviewDetail,
  aspectRatioMenuRef,
  resolutionMenuRef,
  isAspectRatioMenuOpen,
  isResolutionMenuOpen,
  onCloseModelMenu,
  onAspectRatioMenuOpenChange,
  onResolutionMenuOpenChange,
  onQualityMenuOpenChange,
  onImageAspectRatioChange,
  onImageResolutionChange,
  onImageCustomRatioChange,
}: ComposerRatioResolutionSettingsProps) {
  if (imageSizeMode !== "ratio") {
    return null;
  }
  const grokMode = isGrokImageModel(imageModel);
  const aspectOptions = grokMode ? GROK_IMAGE_ASPECT_RATIO_OPTIONS : IMAGE_ASPECT_RATIO_OPTIONS;
  const configuredResolutions = normalizeStringArray(imageResolutions);
  const resolutionOptions = configuredResolutions.length
    ? IMAGE_RESOLUTION_OPTIONS.filter((option) => configuredResolutions.includes(option.value === "1080p" ? "1k" : option.value))
    : grokMode ? GROK_IMAGE_RESOLUTION_OPTIONS : GPT_IMAGE_RESOLUTION_OPTIONS;
  const paidSizeDisabled = imageChannelType === "account_pool";
  const requiresPaidForSelection = (aspectRatio: ImageAspectRatio, resolution: ImageResolution) =>
    paidSizeDisabled && requiresPaidAccountImageSize(buildImageSize({
      mode: "ratio",
      aspectRatio,
      resolution,
      customRatio: imageCustomRatio,
      customWidth: "1024",
      customHeight: "1024",
    }));
  return (
    <>
      <ComposerOptionMenu
        menuRef={aspectRatioMenuRef}
        open={isAspectRatioMenuOpen}
        label="比例"
        buttonAriaLabel="选择图片比例"
        value={imageAspectRatio}
        valueLabel={imageAspectRatioLabel}
        options={aspectOptions}
        disabledLabel="号池禁用"
        isOptionDisabled={(option) => requiresPaidForSelection(option.value as ImageAspectRatio, imageResolution)}
        getOptionTitle={(option) => requiresPaidForSelection(option.value as ImageAspectRatio, imageResolution)
          ? "本地号池没有 Paid 图片账号，已禁用该尺寸"
          : undefined}
        getOptionKey={(option) => option.label}
        onToggle={() => {
          onAspectRatioMenuOpenChange(!isAspectRatioMenuOpen);
          onCloseModelMenu();
          onResolutionMenuOpenChange(false);
          onQualityMenuOpenChange(false);
        }}
        onSelect={(value) => {
          onImageAspectRatioChange(value as ImageAspectRatio);
          onAspectRatioMenuOpenChange(false);
        }}
      />
      <ComposerOptionMenu
        menuRef={resolutionMenuRef}
        open={isResolutionMenuOpen}
        label="分辨率"
        buttonAriaLabel="选择图片分辨率"
        value={imageResolution}
        valueLabel={imageResolutionLabel}
        options={resolutionOptions}
        disabledLabel="号池禁用"
        isOptionDisabled={(option) => requiresPaidForSelection(imageAspectRatio, option.value as ImageResolution)}
        getOptionTitle={(option) => requiresPaidForSelection(imageAspectRatio, option.value as ImageResolution)
          ? "本地号池没有 Paid 图片账号，已禁用该尺寸"
          : undefined}
        desktopAlign="left"
        desktopWidthClass="w-[min(12rem,calc(100vw-3rem))]"
        onToggle={() => {
          onResolutionMenuOpenChange(!isResolutionMenuOpen);
          onCloseModelMenu();
          onAspectRatioMenuOpenChange(false);
          onQualityMenuOpenChange(false);
        }}
        onSelect={(value) => {
          onImageResolutionChange(value as ImageResolution);
          onResolutionMenuOpenChange(false);
        }}
      />
      {imageAspectRatio === CUSTOM_IMAGE_ASPECT_RATIO && !grokMode ? (
        <div
          className={cn(
            "col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-surface-muted/75 px-3 py-1.5 sm:col-span-3",
            isCustomRatioInvalid ? "border-rose-300 dark:border-rose-500/60" : "border-transparent",
          )}
        >
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">自定义比例</span>
          <Input
            aria-label="自定义图片比例"
            value={imageCustomRatio}
            onChange={(event) => onImageCustomRatioChange(event.target.value)}
            placeholder="例如 5:4 / 2.39:1"
            aria-invalid={isCustomRatioInvalid}
            className="h-8 min-w-0 border-0 bg-transparent px-0 text-right text-xs font-semibold text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
      ) : null}
      <ComposerSettingsInfoCard title="计算后分辨率" value={sizePreviewLabel} detail={sizePreviewDetail} />
    </>
  );
}
