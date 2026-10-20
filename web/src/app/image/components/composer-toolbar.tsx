import type { RefObject } from "react";
import { ArrowUp, Coins, ImagePlus, Plus } from "lucide-react";

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
        {props.composerMode === "image" && props.estimatedCreditCost > 0 ? (
          <span
            className="hidden items-center gap-1 rounded-full border border-brand-border bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand tabular-nums sm:inline-flex"
            title={props.estimatedCreditCostDetail}
          >
            <Coins className="size-3" />
            <span>{props.estimatedCreditCost} 积分</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={props.onPickReferenceImage}
          className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-hover hover:text-foreground sm:size-9 sm:border sm:border-border/80 sm:bg-surface"
          aria-label="上传参考图"
          title="上传参考图"
        >
          <Plus className="size-5 sm:hidden" />
          <ImagePlus className="hidden size-4 sm:block" />
        </button>
        <button
          type="button"
          onClick={() => void props.onSubmit()}
          disabled={!props.prompt.trim() || paidSizeUnavailable}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm transition hover:bg-brand/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-surface-active disabled:text-muted-foreground sm:size-9"
          aria-label={submitLabel}
          title={submitTitle}
        >
          <ArrowUp className="size-4.5 sm:size-4" />
        </button>
      </div>
    </div>
  );
}
