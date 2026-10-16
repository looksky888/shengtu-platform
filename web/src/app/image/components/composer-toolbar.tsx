import type { RefObject } from "react";
import { ArrowUp, ImagePlus, Plus } from "lucide-react";

import { ComposerModeSwitch } from "@/app/image/components/composer-mode-switch";
import { ComposerModelMenu } from "@/app/image/components/composer-model-menu";
import { ComposerSettingsPopover } from "@/app/image/components/composer-settings-popover";
import type { ImageComposerProps } from "@/app/image/components/image-composer-types";
import { buildImageSize } from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";

type ComposerToolbarProps = Omit<
  ImageComposerProps,
  "textareaRef" | "fileInputRef" | "referenceImages" | "onPromptChange" | "onReferenceImageChange" | "onRemoveReferenceImage"
> & {
  referenceImageCount: number;
  isModelMenuOpen: boolean;
  isAspectRatioMenuOpen: boolean;
  isResolutionMenuOpen: boolean;
  isQualityMenuOpen: boolean;
  isOutputHintOpen: boolean;
  isImageSettingsOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement | null>;
  aspectRatioMenuRef: RefObject<HTMLDivElement | null>;
  resolutionMenuRef: RefObject<HTMLDivElement | null>;
  qualityMenuRef: RefObject<HTMLDivElement | null>;
  onModelMenuOpenChange: (open: boolean) => void;
  onAspectRatioMenuOpenChange: (open: boolean) => void;
  onResolutionMenuOpenChange: (open: boolean) => void;
  onQualityMenuOpenChange: (open: boolean) => void;
  onOutputHintOpenChange: (open: boolean) => void;
  onImageSettingsOpenChange: (open: boolean) => void;
  onCloseParameterMenus: () => void;
  onCloseModelMenu: () => void;
  onPickReferenceImage: () => void;
};

function buildSettingsProps(props: ComposerToolbarProps) {
  const selectedOption = props.imageModelOptions.find((option) => option.id === props.imageModelOptionId);
  return {
    isOpen: props.isImageSettingsOpen,
    isAspectRatioMenuOpen: props.isAspectRatioMenuOpen,
    isResolutionMenuOpen: props.isResolutionMenuOpen,
    isQualityMenuOpen: props.isQualityMenuOpen,
    isOutputHintOpen: props.isOutputHintOpen,
    aspectRatioMenuRef: props.aspectRatioMenuRef,
    resolutionMenuRef: props.resolutionMenuRef,
    qualityMenuRef: props.qualityMenuRef,
    imageModel: props.imageModel,
    imageChannelType: selectedOption?.channelType,
    imageResolutions: selectedOption?.resolutions,
    imageCount: props.imageCount,
    imageSizeMode: props.imageSizeMode,
    imageAspectRatio: props.imageAspectRatio,
    imageResolution: props.imageResolution,
    imageCustomRatio: props.imageCustomRatio,
    imageCustomWidth: props.imageCustomWidth,
    imageCustomHeight: props.imageCustomHeight,
    imageQuality: props.imageQuality,
    imageQualityOptions: props.imageQualityOptions,
    imageOutputFormat: props.imageOutputFormat,
    imageOutputCompression: props.imageOutputCompression,
    imageOutputHint: props.imageOutputHint,
    estimatedCreditCost: props.estimatedCreditCost,
    estimatedCreditCostDetail: props.estimatedCreditCostDetail,
    onOpenChange: props.onImageSettingsOpenChange,
    onAspectRatioMenuOpenChange: props.onAspectRatioMenuOpenChange,
    onResolutionMenuOpenChange: props.onResolutionMenuOpenChange,
    onQualityMenuOpenChange: props.onQualityMenuOpenChange,
    onOutputHintOpenChange: props.onOutputHintOpenChange,
    onCloseModelMenu: props.onCloseModelMenu,
    onImageCountChange: props.onImageCountChange,
    onImageSizeModeChange: props.onImageSizeModeChange,
    onImageAspectRatioChange: props.onImageAspectRatioChange,
    onImageResolutionChange: props.onImageResolutionChange,
    onImageCustomRatioChange: props.onImageCustomRatioChange,
    onImageCustomWidthChange: props.onImageCustomWidthChange,
    onImageCustomHeightChange: props.onImageCustomHeightChange,
    onImageQualityChange: props.onImageQualityChange,
    onImageOutputFormatChange: props.onImageOutputFormatChange,
    onImageOutputCompressionChange: props.onImageOutputCompressionChange,
  };
}

export function ComposerToolbar(props: ComposerToolbarProps) {
  const selectedOption = props.imageModelOptions.find((option) => option.id === props.imageModelOptionId)
    || props.imageModelOptions.find((option) => option.value === props.imageModel);
  const imageModelLabel = selectedOption ? `${selectedOption.label}${selectedOption.channelAlias ? ` · ${selectedOption.channelAlias}` : ""}` : props.imageModel;
  const submitLabel =
    props.composerMode === "chat" ? "发送对话" : props.referenceImageCount > 0 ? "编辑图片" : "生成图片";
  const selectedSize = buildImageSize({
    mode: props.imageSizeMode,
    aspectRatio: props.imageAspectRatio,
    resolution: props.imageResolution,
    customRatio: props.imageCustomRatio,
    customWidth: props.imageCustomWidth,
    customHeight: props.imageCustomHeight,
  });
  const paidSizeUnavailable = props.composerMode === "image"
    && selectedOption?.channelType === "account_pool"
    && requiresPaidAccountImageSize(selectedSize);
  const submitTitle = paidSizeUnavailable
    ? "本地号池已禁用需要 Paid 账号的大尺寸"
    : submitLabel;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
        <ComposerModeSwitch composerMode={props.composerMode} onComposerModeChange={props.onComposerModeChange} />
        <ComposerModelMenu
          menuRef={props.modelMenuRef}
          open={props.isModelMenuOpen}
          label={imageModelLabel}
          imageModel={props.imageModel}
          imageModelOptionId={props.imageModelOptionId}
          imageModelOptions={props.imageModelOptions}
          onOpenChange={props.onModelMenuOpenChange}
          onClosePeerMenus={props.onCloseParameterMenus}
          onImageModelChange={props.onImageModelChange}
        />
        {props.composerMode === "image" ? <ComposerSettingsPopover {...buildSettingsProps(props)} /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={props.onPickReferenceImage}
          className="inline-flex size-11 items-center justify-center rounded-full text-[#686b73] transition hover:bg-black/[0.05] dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground sm:size-10 sm:border sm:border-[#e5e7eb] sm:bg-white sm:text-[#45515e] sm:dark:border-border sm:dark:bg-background/70 sm:dark:text-muted-foreground"
          aria-label="上传参考图"
          title="上传参考图"
        >
          <Plus className="size-6 sm:hidden" />
          <ImagePlus className="hidden size-4 sm:block" />
        </button>
        <button
          type="button"
          onClick={() => void props.onSubmit()}
          disabled={!props.prompt.trim() || paidSizeUnavailable}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#181e25] text-white shadow-[0_4px_10px_rgba(24,30,37,0.12)] transition hover:bg-[#2a323d] disabled:cursor-not-allowed disabled:bg-[#e1e2e4] disabled:text-[#73777f] dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 dark:disabled:bg-muted dark:disabled:text-muted-foreground sm:size-10"
          aria-label={submitLabel}
          title={submitTitle}
        >
          <ArrowUp className="size-5 sm:size-4" />
        </button>
      </div>
    </div>
  );
}
