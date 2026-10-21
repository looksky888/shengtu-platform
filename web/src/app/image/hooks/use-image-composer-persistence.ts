import { useEffect } from "react";

import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import type { ComposerMode } from "@/app/image/lib/image-page-types";
import {
  COMPOSER_MODE_STORAGE_KEY,
  IMAGE_ASPECT_RATIO_STORAGE_KEY,
  IMAGE_COUNT_STORAGE_KEY,
  IMAGE_CUSTOM_HEIGHT_STORAGE_KEY,
  IMAGE_CUSTOM_RATIO_STORAGE_KEY,
  IMAGE_CUSTOM_WIDTH_STORAGE_KEY,
  IMAGE_MODEL_STORAGE_KEY,
  IMAGE_MODEL_OPTION_STORAGE_KEY,
  IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY,
  IMAGE_OUTPUT_FORMAT_STORAGE_KEY,
  IMAGE_QUALITY_STORAGE_KEY,
  IMAGE_RESOLUTION_STORAGE_KEY,
  IMAGE_SIZE_MODE_STORAGE_KEY,
  IMAGE_SIZE_STORAGE_KEY,
  safeRemoveLocalStorageItem,
  safeSetLocalStorageItem,
} from "@/app/image/lib/image-storage-utils";
import { normalizeOutputCompressionValue, normalizeRequestedImageCount } from "@/app/image/lib/image-turn-utils";
import type { ImageModel, ImageOutputFormat, ImageQuality } from "@/lib/api";

type UseImageComposerPersistenceParams = {
  composerMode: ComposerMode;
  imageModel: ImageModel;
  imageModelOptionId: string;
  imageCount: string;
  imageSizeMode: ImageSizeMode;
  imageAspectRatio: ImageAspectRatio;
  imageResolution: ImageResolution;
  imageCustomRatio: string;
  imageCustomWidth: string;
  imageCustomHeight: string;
  imageSize: string;
  imageQuality: ImageQuality;
  imageOutputFormat: ImageOutputFormat;
  imageOutputCompression: string;
};

export function useImageComposerPersistence(params: UseImageComposerPersistenceParams) {
  const {
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
  } = params;

  useEffect(() => {
    safeSetLocalStorageItem(COMPOSER_MODE_STORAGE_KEY, composerMode);
  }, [composerMode]);

  useEffect(() => {
    safeSetLocalStorageItem(IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);

  useEffect(() => {
    if (imageModelOptionId) safeSetLocalStorageItem(IMAGE_MODEL_OPTION_STORAGE_KEY, imageModelOptionId);
    else safeRemoveLocalStorageItem(IMAGE_MODEL_OPTION_STORAGE_KEY);
  }, [imageModelOptionId]);

  useEffect(() => {
    if (composerMode === "chat") return;
    safeSetLocalStorageItem(IMAGE_COUNT_STORAGE_KEY, String(normalizeRequestedImageCount(imageCount)));
  }, [composerMode, imageCount]);

  useEffect(() => {
    safeSetLocalStorageItem(IMAGE_SIZE_MODE_STORAGE_KEY, imageSizeMode);
    if (imageAspectRatio) safeSetLocalStorageItem(IMAGE_ASPECT_RATIO_STORAGE_KEY, imageAspectRatio);
    else safeRemoveLocalStorageItem(IMAGE_ASPECT_RATIO_STORAGE_KEY);
    safeSetLocalStorageItem(IMAGE_RESOLUTION_STORAGE_KEY, imageResolution);
    safeSetLocalStorageItem(IMAGE_CUSTOM_RATIO_STORAGE_KEY, imageCustomRatio);
    safeSetLocalStorageItem(IMAGE_CUSTOM_WIDTH_STORAGE_KEY, imageCustomWidth);
    safeSetLocalStorageItem(IMAGE_CUSTOM_HEIGHT_STORAGE_KEY, imageCustomHeight);
    if (imageSize) safeSetLocalStorageItem(IMAGE_SIZE_STORAGE_KEY, imageSize);
    else safeRemoveLocalStorageItem(IMAGE_SIZE_STORAGE_KEY);
  }, [imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSize, imageSizeMode]);

  useEffect(() => {
    safeSetLocalStorageItem(IMAGE_QUALITY_STORAGE_KEY, imageQuality);
  }, [imageQuality]);

  useEffect(() => {
    safeSetLocalStorageItem(IMAGE_OUTPUT_FORMAT_STORAGE_KEY, imageOutputFormat);
    const normalizedCompression = normalizeOutputCompressionValue(imageOutputCompression);
    if (normalizedCompression === undefined || imageOutputFormat === "png") {
      safeRemoveLocalStorageItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY);
      return;
    }
    safeSetLocalStorageItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY, String(normalizedCompression));
  }, [imageOutputCompression, imageOutputFormat]);
}
