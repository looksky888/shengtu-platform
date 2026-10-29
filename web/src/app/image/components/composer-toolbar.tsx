import type { RefObject } from "react";
import { ArrowUp, ImagePlus } from "lucide-react";

import { ComposerModeSwitch } from "@/app/image/components/composer-mode-switch";
import { ComposerModelMenu } from "@/app/image/components/composer-model-menu";
import { ComposerSettingsPopover } from "@/app/image/components/composer-settings-popover";
import type { ImageComposerProps } from "@/app/image/components/image-composer-types";
import { buildImageSize } from "@/app/image/image-options";
import { requiresPaidAccountImageSize } from "@/app/image/image-paid-size";
import { Kbd } from "@/components/ui/kbd";

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
  const imageModelLabel = selectedOption ? selectedOption.label : props.imageModel;
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
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <ComposerModeSwitch composerMode={props.composerMode} onComposerModeChange={props.onComposerModeChange} />
        <ComposerModelMenu
          menuRef={props.modelMenuRef}
          open={props.isModelMenuOpen}
          label={imageModelLabel}
          imageModel={props.imageModel}
          imageModelOptionId={props.imageModelOptionId}
          imageModelOptions={props.imageModelOptions}
          onOpenChange={props.onModelMenuOpenChange}
          onClosePeerMenus={() => {
            props.onCloseParameterMenus();
            props.onImageSettingsOpenChange(false);
          }}
          onImageModelChange={props.onImageModelChange}
        />
        {props.composerMode === "image" ? <ComposerSettingsPopover {...buildSettingsProps(props)} /> : null}
        <button
          type="button"
          onClick={props.onPickReferenceImage}
          className="inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface-muted/90 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="上传参考图"
          title="上传参考图"
        >
          <ImagePlus className="size-3.5" />
          <span className="hidden md:inline">参考图</span>
          {props.referenceImageCount > 0 ? (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
              {props.referenceImageCount}
            </span>
          ) : null}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {props.composerMode === "image" && props.estimatedCreditCost > 0 ? (
          <span
            className="inline-flex items-center px-1 text-[11px] text-muted-foreground tabular-nums sm:text-xs"
            title={props.estimatedCreditCostDetail}
          >
            <span className="hidden sm:inline">预计消耗&nbsp;</span>{props.estimatedCreditCost} 积分
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void props.onSubmit()}
          disabled={!props.prompt.trim() || paidSizeUnavailable}
          className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={submitLabel}
          title={submitTitle}
        >
          <ArrowUp className="size-3.5" />
          <span className="hidden sm:inline">{props.composerMode === "chat" ? "发送" : "开始生成"}</span>
          <Kbd className="hidden border-white/20 bg-white/15 text-current shadow-none sm:inline-flex">
            ⏎
          </Kbd>
        </button>
      </div>
    </div>
  );
}
