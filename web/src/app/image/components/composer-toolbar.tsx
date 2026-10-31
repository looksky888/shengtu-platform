import { ArrowUp, Coins, ImagePlus } from "lucide-react";

import { ComposerModeSwitch } from "@/app/image/components/composer-mode-switch";
import { ComposerModelMenu } from "@/app/image/components/composer-model-menu";
import { ComposerSettingsPopover } from "@/app/image/components/composer-settings-popover";
import type { ComposerSettingsPopoverProps } from "@/app/image/components/composer-settings-types";
import {
  useImageComposerContext,
  type ImageComposerContextValue,
} from "@/app/image/components/image-composer-context";
import { buildImageSize } from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import { Kbd } from "@/components/ui/kbd";

function buildSettingsProps({
  composerProps,
  menus,
}: ImageComposerContextValue): ComposerSettingsPopoverProps {
  const selectedOption = composerProps.imageModelOptions.find(
    (option) => option.id === composerProps.imageModelOptionId,
  );
  return {
    isOpen: menus.isImageSettingsOpen,
    isAspectRatioMenuOpen: menus.isAspectRatioMenuOpen,
    isResolutionMenuOpen: menus.isResolutionMenuOpen,
    isQualityMenuOpen: menus.isQualityMenuOpen,
    isOutputHintOpen: menus.isOutputHintOpen,
    aspectRatioMenuRef: menus.aspectRatioMenuRef,
    resolutionMenuRef: menus.resolutionMenuRef,
    qualityMenuRef: menus.qualityMenuRef,
    imageModel: composerProps.imageModel,
    imageChannelType: selectedOption?.channelType,
    imageResolutions: selectedOption?.resolutions,
    imageCount: composerProps.imageCount,
    imageSizeMode: composerProps.imageSizeMode,
    imageAspectRatio: composerProps.imageAspectRatio,
    imageResolution: composerProps.imageResolution,
    imageCustomRatio: composerProps.imageCustomRatio,
    imageCustomWidth: composerProps.imageCustomWidth,
    imageCustomHeight: composerProps.imageCustomHeight,
    imageQuality: composerProps.imageQuality,
    imageQualityOptions: composerProps.imageQualityOptions,
    imageOutputFormat: composerProps.imageOutputFormat,
    imageOutputCompression: composerProps.imageOutputCompression,
    imageOutputHint: composerProps.imageOutputHint,
    estimatedCreditCost: composerProps.estimatedCreditCost,
    estimatedCreditCostDetail: composerProps.estimatedCreditCostDetail,
    onOpenChange: menus.handleImageSettingsOpenChange,
    onAspectRatioMenuOpenChange: menus.setIsAspectRatioMenuOpen,
    onResolutionMenuOpenChange: menus.setIsResolutionMenuOpen,
    onQualityMenuOpenChange: menus.setIsQualityMenuOpen,
    onOutputHintOpenChange: menus.setIsOutputHintOpen,
    onCloseModelMenu: () => menus.setIsModelMenuOpen(false),
    onImageCountChange: composerProps.onImageCountChange,
    onImageSizeModeChange: composerProps.onImageSizeModeChange,
    onImageAspectRatioChange: composerProps.onImageAspectRatioChange,
    onImageResolutionChange: composerProps.onImageResolutionChange,
    onImageCustomRatioChange: composerProps.onImageCustomRatioChange,
    onImageCustomWidthChange: composerProps.onImageCustomWidthChange,
    onImageCustomHeightChange: composerProps.onImageCustomHeightChange,
    onImageQualityChange: composerProps.onImageQualityChange,
    onImageOutputFormatChange: composerProps.onImageOutputFormatChange,
    onImageOutputCompressionChange: composerProps.onImageOutputCompressionChange,
  };
}

export function ComposerToolbar() {
  const context = useImageComposerContext();
  const { composerProps, menus, input } = context;
  const referenceImageCount = composerProps.referenceImages.length;

  const selectedOption =
    composerProps.imageModelOptions.find(
      (option) => option.id === composerProps.imageModelOptionId,
    ) ||
    composerProps.imageModelOptions.find(
      (option) => option.value === composerProps.imageModel,
    );
  const imageModelLabel = selectedOption
    ? selectedOption.label
    : composerProps.imageModel;
  const submitLabel =
    composerProps.composerMode === "chat"
      ? "发送对话"
      : referenceImageCount > 0
        ? "编辑图片"
        : "生成图片";
  const selectedSize = buildImageSize({
    mode: composerProps.imageSizeMode,
    aspectRatio: composerProps.imageAspectRatio,
    resolution: composerProps.imageResolution,
    customRatio: composerProps.imageCustomRatio,
    customWidth: composerProps.imageCustomWidth,
    customHeight: composerProps.imageCustomHeight,
  });
  const paidSizeUnavailable =
    composerProps.composerMode === "image" &&
    selectedOption?.channelType === "account_pool" &&
    requiresPaidAccountImageSize(selectedSize);
  const submitTitle = paidSizeUnavailable
    ? "本地号池已禁用需要 Paid 账号的大尺寸"
    : submitLabel;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <ComposerModeSwitch
          composerMode={composerProps.composerMode}
          onComposerModeChange={composerProps.onComposerModeChange}
        />
        <ComposerModelMenu
          menuRef={menus.modelMenuRef}
          open={menus.isModelMenuOpen}
          label={imageModelLabel}
          imageModel={composerProps.imageModel}
          imageModelOptionId={composerProps.imageModelOptionId}
          imageModelOptions={composerProps.imageModelOptions}
          onOpenChange={menus.setIsModelMenuOpen}
          onClosePeerMenus={() => {
            menus.closeParameterMenus();
            menus.handleImageSettingsOpenChange(false);
          }}
          onImageModelChange={composerProps.onImageModelChange}
        />
        {composerProps.composerMode === "image" ? (
          <ComposerSettingsPopover {...buildSettingsProps(context)} />
        ) : null}
        <button
          type="button"
          onClick={input.handlePickReferenceImage}
          className="inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="上传参考图"
          title="上传参考图"
        >
          <ImagePlus className="size-3.5" />
          <span className="hidden md:inline">参考图</span>
          {referenceImageCount > 0 ? (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
              {referenceImageCount}
            </span>
          ) : null}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {composerProps.composerMode === "image" &&
        composerProps.estimatedCreditCost > 0 ? (
          <span
            className="inline-flex h-7.5 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-500/35 bg-amber-500/12 px-2.5 text-[11px] font-medium text-amber-800 shadow-2xs tabular-nums sm:text-xs dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-300"
            title={composerProps.estimatedCreditCostDetail}
          >
            <Coins
              className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span className="hidden opacity-90 sm:inline">扣除</span>
            <strong className="font-mono font-bold text-amber-700 dark:text-amber-200">
              {composerProps.estimatedCreditCost}
            </strong>
            <span>积分</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void composerProps.onSubmit()}
          disabled={!composerProps.prompt.trim() || paidSizeUnavailable}
          className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={submitLabel}
          title={submitTitle}
        >
          <ArrowUp className="size-3.5" />
          <span className="hidden sm:inline">
            {composerProps.composerMode === "chat" ? "发送" : "开始生成"}
          </span>
          <Kbd className="hidden border-white/20 bg-white/15 text-current shadow-none sm:inline-flex">
            ⏎
          </Kbd>
        </button>
      </div>
    </div>
  );
}
