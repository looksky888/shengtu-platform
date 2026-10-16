"use client";
import type { ReactNode } from "react";

import { ComposerPromptPanel } from "@/app/image/components/composer-prompt-panel";
import { ComposerToolbar } from "@/app/image/components/composer-toolbar";
import type { ImageComposerProps } from "@/app/image/components/image-composer-types";
import { ImageReferenceStrip } from "@/app/image/components/image-reference-strip";
import { useImageComposerInput } from "@/app/image/hooks/use-image-composer-input";
import { useImageComposerMenus } from "@/app/image/hooks/use-image-composer-menus";

function ImageComposerDock({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

export function ImageComposer(props: ImageComposerProps) {
  const {
    composerMode,
    prompt,
    imageCount,
    imageModel,
    imageModelOptionId,
    imageModelOptions,
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
    imageOutputHint,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    referenceImages,
    textareaRef,
    fileInputRef,
    onComposerModeChange,
    onPromptChange,
    onImageCountChange,
    onImageModelChange,
    onImageSizeModeChange,
    onImageAspectRatioChange,
    onImageResolutionChange,
    onImageCustomRatioChange,
    onImageCustomWidthChange,
    onImageCustomHeightChange,
    onImageQualityChange,
    onImageOutputFormatChange,
    onImageOutputCompressionChange,
    onSubmit,
    onReferenceImageChange,
    onRemoveReferenceImage,
  } = props;

  const menus = useImageComposerMenus({ composerMode, supportsQuality: imageQualityOptions.length > 0 });
  const input = useImageComposerInput({
    composerMode,
    fileInputRef,
    onComposerModeChange,
    onReferenceImageChange,
  });

  return (
    <ImageComposerDock>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={input.handleFileInputChange}
      />
      <ImageReferenceStrip
        visible={composerMode === "image"}
        referenceImages={referenceImages}
        onRemoveReferenceImage={onRemoveReferenceImage}
      />
      <ComposerPromptPanel
        composerMode={composerMode}
        prompt={prompt}
        referenceImageCount={referenceImages.length}
        promptAreaHeight={input.promptAreaHeight}
        isPromptAreaResizing={input.isPromptAreaResizing}
        isReferenceImageDragActive={input.isReferenceImageDragActive}
        composerPanelRef={input.composerPanelRef}
        composerToolbarRef={input.composerToolbarRef}
        textareaRef={textareaRef}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
        onTextareaPaste={input.handleTextareaPaste}
        onReferenceImageDragEnter={input.handleReferenceImageDragEnter}
        onReferenceImageDragOver={input.handleReferenceImageDragOver}
        onReferenceImageDragLeave={input.handleReferenceImageDragLeave}
        onReferenceImageDrop={input.handleReferenceImageDrop}
        onPromptResizeStart={input.handlePromptResizeStart}
        onPromptResizeMove={input.handlePromptResizeMove}
        onPromptResizeEnd={input.handlePromptResizeEnd}
        onPromptResizeKeyDown={input.handlePromptResizeKeyDown}
        onPromptResizeLostPointerCapture={input.handlePromptResizeLostPointerCapture}
      >
        <ComposerToolbar
          composerMode={composerMode}
          prompt={prompt}
          imageCount={imageCount}
          imageModel={imageModel}
          imageModelOptionId={imageModelOptionId}
          imageModelOptions={imageModelOptions}
          imageSizeMode={imageSizeMode}
          imageAspectRatio={imageAspectRatio}
          imageResolution={imageResolution}
          imageCustomRatio={imageCustomRatio}
          imageCustomWidth={imageCustomWidth}
          imageCustomHeight={imageCustomHeight}
          imageQuality={imageQuality}
          imageQualityOptions={imageQualityOptions}
          imageOutputFormat={imageOutputFormat}
          imageOutputCompression={imageOutputCompression}
          imageOutputHint={imageOutputHint}
          estimatedCreditCost={estimatedCreditCost}
          estimatedCreditCostDetail={estimatedCreditCostDetail}
          referenceImageCount={referenceImages.length}
          isModelMenuOpen={menus.isModelMenuOpen}
          isAspectRatioMenuOpen={menus.isAspectRatioMenuOpen}
          isResolutionMenuOpen={menus.isResolutionMenuOpen}
          isQualityMenuOpen={menus.isQualityMenuOpen}
          isOutputHintOpen={menus.isOutputHintOpen}
          isImageSettingsOpen={menus.isImageSettingsOpen}
          modelMenuRef={menus.modelMenuRef}
          aspectRatioMenuRef={menus.aspectRatioMenuRef}
          resolutionMenuRef={menus.resolutionMenuRef}
          qualityMenuRef={menus.qualityMenuRef}
          onComposerModeChange={onComposerModeChange}
          onImageCountChange={onImageCountChange}
          onImageModelChange={onImageModelChange}
          onImageSizeModeChange={onImageSizeModeChange}
          onImageAspectRatioChange={onImageAspectRatioChange}
          onImageResolutionChange={onImageResolutionChange}
          onImageCustomRatioChange={onImageCustomRatioChange}
          onImageCustomWidthChange={onImageCustomWidthChange}
          onImageCustomHeightChange={onImageCustomHeightChange}
          onImageQualityChange={onImageQualityChange}
          onImageOutputFormatChange={onImageOutputFormatChange}
          onImageOutputCompressionChange={onImageOutputCompressionChange}
          onSubmit={onSubmit}
          onModelMenuOpenChange={menus.setIsModelMenuOpen}
          onAspectRatioMenuOpenChange={menus.setIsAspectRatioMenuOpen}
          onResolutionMenuOpenChange={menus.setIsResolutionMenuOpen}
          onQualityMenuOpenChange={menus.setIsQualityMenuOpen}
          onOutputHintOpenChange={menus.setIsOutputHintOpen}
          onImageSettingsOpenChange={menus.handleImageSettingsOpenChange}
          onCloseParameterMenus={menus.closeParameterMenus}
          onCloseModelMenu={() => menus.setIsModelMenuOpen(false)}
          onPickReferenceImage={input.handlePickReferenceImage}
        />
      </ComposerPromptPanel>
    </ImageComposerDock>
  );
}
