import { useCallback, useEffect, useState } from "react";

import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import {
  type ImageModelOption,
  useImageComposerDerived,
} from "@/app/image/hooks/use-image-composer-derived";
import { useImageComposerPersistence } from "@/app/image/hooks/use-image-composer-persistence";
import { useImageComposerRemoteSettings } from "@/app/image/hooks/use-image-composer-remote-settings";
import { type ComposerMode } from "@/app/image/lib/image-page-types";
import {
  getStoredComposerMode,
  getStoredImageCount,
  getStoredImageModel,
  getStoredImageModelOptionId,
  getStoredImageOutputCompression,
  getStoredImageOutputFormat,
  getStoredImageQuality,
  getStoredImageSizeSelection,
} from "@/app/image/lib/image-storage-utils";
import { type ImageModel, type ImageOutputFormat, type ImageQuality, type ImageVisibility } from "@/lib/api";
import { isGrokImageModel } from "@/lib/api-models";
import { normalizeStringArray } from "@/lib/model-catalog-normalizers";

type UseImageComposerSettingsParams = {
  imageModelOptions: ImageModelOption[];
  chatModelOptions: ImageModelOption[];
  defaultImageModel: ImageModel;
  defaultTextModel: ImageModel;
};

export function useImageComposerSettings({
  imageModelOptions,
  chatModelOptions,
  defaultImageModel: _defaultImageModel,
  defaultTextModel: _defaultTextModel,
}: UseImageComposerSettingsParams) {
  const [imagePrompt, setImagePrompt] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>(getStoredComposerMode);
  const [imageModel, setImageModel] = useState<ImageModel>(getStoredImageModel);
  const [imageModelOptionId, setImageModelOptionId] = useState(getStoredImageModelOptionId);
  const [imageCount, setImageCount] = useState(getStoredImageCount);
  const [imageSizeMode, setImageSizeMode] = useState<ImageSizeMode>(() => getStoredImageSizeSelection().mode);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>(() => getStoredImageSizeSelection().aspectRatio);
  const [imageResolution, setImageResolution] = useState<ImageResolution>(() => getStoredImageSizeSelection().resolution);
  const { imageCreditCosts } = useImageComposerRemoteSettings();
  const [imageCustomRatio, setImageCustomRatio] = useState(() => getStoredImageSizeSelection().customRatio);
  const [imageCustomWidth, setImageCustomWidth] = useState(() => getStoredImageSizeSelection().customWidth);
  const [imageCustomHeight, setImageCustomHeight] = useState(() => getStoredImageSizeSelection().customHeight);
  const [imageQuality, setImageQuality] = useState<ImageQuality>(getStoredImageQuality);
  const [imageOutputFormat, setImageOutputFormat] = useState<ImageOutputFormat>(getStoredImageOutputFormat);
  const [imageOutputCompression, setImageOutputCompression] = useState(getStoredImageOutputCompression);
  const [defaultImageVisibility, setDefaultImageVisibility] = useState<ImageVisibility>("private");

  const restoreStoredComposerSettings = useCallback(() => {
    const storedSelection = getStoredImageSizeSelection();
    setImageSizeMode(storedSelection.mode);
    setImageAspectRatio(storedSelection.aspectRatio);
    setImageResolution(storedSelection.resolution);
    setImageCustomRatio(storedSelection.customRatio);
    setImageCustomWidth(storedSelection.customWidth);
    setImageCustomHeight(storedSelection.customHeight);
    setImageOutputFormat(getStoredImageOutputFormat());
    setImageOutputCompression(getStoredImageOutputCompression());
  }, []);

  const handleImageCountChange = useCallback((value: string) => setImageCount(value), []);

  useEffect(() => {
    if (composerMode !== "image" || imageModelOptions.length === 0) return;
    const selected = imageModelOptions.find((option) => option.id === imageModelOptionId);
    if (selected) {
      if (selected.value !== imageModel) setImageModel(selected.value);
      return;
    }
    const fallback = imageModelOptions.find((option) => option.value === imageModel) || imageModelOptions[0];
    setImageModelOptionId(fallback.id);
    if (fallback.value !== imageModel) setImageModel(fallback.value);
  }, [composerMode, imageModel, imageModelOptionId, imageModelOptions]);

  useEffect(() => {
    const configuredResolutions = normalizeStringArray(imageModelOptions.find((option) => option.id === imageModelOptionId)?.resolutions);
    if (configuredResolutions.length > 0) {
      const normalizedResolution = imageResolution === "1080p" ? "1k" : imageResolution;
      if (imageResolution !== "auto" && !configuredResolutions.includes(normalizedResolution)) {
        setImageResolution(configuredResolutions[0] as ImageResolution);
      }
      return;
    }
    const grokMode = isGrokImageModel(imageModel);
    if (grokMode && !["auto", "1k", "2k"].includes(imageResolution)) {
      setImageResolution("auto");
      return;
    }
    if (!grokMode && imageResolution !== "1k") {
      setImageResolution("1k");
      return;
    }
  }, [imageAspectRatio, imageModel, imageModelOptionId, imageModelOptions, imageResolution, imageSizeMode]);

  const {
    parsedCount,
    imageSize,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    currentImageSizeSelection,
    composerModelOptions,
    imageQualityOptions,
    imageOutputHint,
  } = useImageComposerDerived({
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
  });

  useImageComposerPersistence({
    composerMode,
    imageModel,
    imageModelOptionId,
    imageCount,
    imageSizeMode,
    imageAspectRatio,
    imageResolution,
    imageCustomRatio,
    imageCustomWidth,
    imageCustomHeight,
    imageSize,
    imageQuality,
    imageOutputFormat,
    imageOutputCompression,
  });

  return {
    imagePrompt,
    setImagePrompt,
    composerMode,
    setComposerMode,
    imageModel,
    setImageModel,
    imageModelOptionId,
    setImageModelOptionId,
    imageCount,
    setImageCount,
    imageSizeMode,
    setImageSizeMode,
    imageAspectRatio,
    setImageAspectRatio,
    imageResolution,
    setImageResolution,
    imageCustomRatio,
    setImageCustomRatio,
    imageCustomWidth,
    setImageCustomWidth,
    imageCustomHeight,
    setImageCustomHeight,
    imageQuality,
    setImageQuality,
    imageOutputFormat,
    setImageOutputFormat,
    imageOutputCompression,
    setImageOutputCompression,
    defaultImageVisibility,
    setDefaultImageVisibility,
    parsedCount,
    estimatedCreditCost,
    estimatedCreditCostDetail,
    imageSize,
    currentImageSizeSelection,
    composerModelOptions,
    imageQualityOptions,
    imageOutputHint,
    handleImageCountChange,
    restoreStoredComposerSettings,
  };
}
