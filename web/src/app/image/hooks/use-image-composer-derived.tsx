import { useMemo } from "react";

import {
  GROK_IMAGE_RESOLUTION_OPTIONS,
  GPT_IMAGE_RESOLUTION_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  buildImageSize,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
} from "@/app/image/image-options";
import type { ComposerMode, ImageCreditCosts } from "@/app/image/lib/image-page-types";
import type { ImageChannelType } from "@/lib/image-channel-api";
import { serializeImageSizeSelection } from "@/app/image/lib/image-storage-utils";
import {
  estimatedCreditsPerImageForModel,
  mapGrokImageSize,
  normalizeRequestedImageCount,
} from "@/app/image/lib/image-turn-utils";
import { supportsImageQuality, type ImageModel } from "@/lib/api";
import { isGrokImageModel } from "@/lib/api-models";

export type ImageModelOption = {
  id: string;
  value: ImageModel;
  label: string;
  channelModelId?: string;
  channelName?: string;
  channelAlias?: string;
  channelType?: ImageChannelType;
  creditCost?: number;
  creditCosts?: Record<string, number>;
  capabilities?: string[];
  resolutions?: string[];
};

type UseImageComposerDerivedParams = {
  composerMode: ComposerMode;
  imageModelOptions: ImageModelOption[];
  chatModelOptions: ImageModelOption[];
  imageModel: ImageModel;
  imageModelOptionId: string;
  imageCount: string;
  imageSizeMode: ImageSizeMode;
  imageAspectRatio: ImageAspectRatio;
  imageResolution: ImageResolution;
  imageCustomRatio: string;
  imageCustomWidth: string;
  imageCustomHeight: string;
  imageCreditCosts: ImageCreditCosts;
};

export function useImageComposerDerived(params: UseImageComposerDerivedParams) {
  const {
    composerMode,
    imageModelOptions,
    chatModelOptions,
    imageModel,
    imageModelOptionId,
    imageCount,
    imageSizeMode,
    imageAspectRatio,
    imageResolution,
    imageCustomRatio,
    imageCustomWidth,
    imageCustomHeight,
    imageCreditCosts,
  } = params;
  const parsedCount = useMemo(() => normalizeRequestedImageCount(imageCount), [imageCount]);
  const imageSize = useMemo(
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
  const selectedImageOption = useMemo(() => imageModelOptions.find((option) => option.id === imageModelOptionId), [imageModelOptionId, imageModelOptions]);
  const estimatedCreditCost = useMemo(() => {
    const sizeHint = imageSize || (imageResolution === "auto" ? (isGrokImageModel(imageModel) ? "1k" : "1080p") : imageResolution);
    const resolutionKey = (imageResolution === "auto" || imageResolution === "1080p" ? "1k" : imageResolution).toLowerCase();
    const perImage = selectedImageOption?.creditCosts?.[resolutionKey]
      ?? selectedImageOption?.creditCost
      ?? estimatedCreditsPerImageForModel(imageModel, imageResolution, sizeHint, imageCreditCosts);
    return { perImage, total: perImage * parsedCount };
  }, [imageCreditCosts, imageModel, imageResolution, imageSize, parsedCount, selectedImageOption]);
  const estimatedCreditCostDetail = useMemo(() => {
    const resolutionOptions = isGrokImageModel(imageModel) ? GROK_IMAGE_RESOLUTION_OPTIONS : GPT_IMAGE_RESOLUTION_OPTIONS;
    const resolutionLabel = resolutionOptions.find((option) => option.value === imageResolution)?.label || imageResolution;
    const displayLabel = imageResolution === "auto" ? "Auto / 默认档" : resolutionLabel;
    if (isGrokImageModel(imageModel)) {
      const mapped = mapGrokImageSize(imageSize || "1:1");
      return `${selectedImageOption?.channelAlias ? `${selectedImageOption.channelAlias} · ` : ""}${displayLabel} · ${mapped} 画幅 × ${parsedCount} 张，预计 ${estimatedCreditCost.total} 积分。`;
    }
    return `${selectedImageOption?.channelAlias ? `${selectedImageOption.channelAlias} · ` : ""}${displayLabel} × ${parsedCount} 张，预计消耗 ${estimatedCreditCost.total} 积分。`;
  }, [estimatedCreditCost.total, imageModel, imageResolution, imageSize, parsedCount, selectedImageOption]);
  const currentImageSizeSelection = useMemo(
    () =>
      serializeImageSizeSelection({
        mode: imageSizeMode,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        customRatio: imageCustomRatio,
        customWidth: imageCustomWidth,
        customHeight: imageCustomHeight,
      }),
    [imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSizeMode],
  );
  const composerModelOptions = composerMode === "chat" ? chatModelOptions : imageModelOptions;
  const imageQualityOptions = supportsImageQuality(imageModel) ? IMAGE_QUALITY_OPTIONS : [];
  const imageOutputHint = useMemo(
    () => (
      <>
        <div><span className="font-semibold text-stone-800">质量说明：</span>Low / Medium / High 会随请求下发，实际效果取决于当前账号和上游链路能力。</div>
        <div className="mt-2"><span className="font-semibold text-stone-800">输出格式：</span>支持 PNG / JPEG / WebP；PNG 不支持压缩率，JPEG / WebP 会下发 0-100 的压缩率参数。</div>
        <div className="mt-2"><span className="font-semibold text-stone-800">GPT 分辨率：</span>固定使用 1K，比例选择会换算为对应像素尺寸并随请求下发。</div>
        <div className="mt-2"><span className="font-semibold text-stone-800">Auto 模式：</span>不会强制指定比例；选择比例模式后会严格按所选画幅生成。</div>
      </>
    ),
    [],
  );

  return {
    parsedCount,
    imageSize,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    currentImageSizeSelection,
    composerModelOptions,
    imageQualityOptions,
    imageOutputHint,
  };
}
