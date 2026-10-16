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
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, composerMode);
  }, [composerMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (imageModelOptionId) window.localStorage.setItem(IMAGE_MODEL_OPTION_STORAGE_KEY, imageModelOptionId);
    else window.localStorage.removeItem(IMAGE_MODEL_OPTION_STORAGE_KEY);
  }, [imageModelOptionId]);

  useEffect(() => {
    if (typeof window === "undefined" || composerMode === "chat") return;
    window.localStorage.setItem(IMAGE_COUNT_STORAGE_KEY, String(normalizeRequestedImageCount(imageCount)));
  }, [composerMode, imageCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IMAGE_SIZE_MODE_STORAGE_KEY, imageSizeMode);
    if (imageAspectRatio) window.localStorage.setItem(IMAGE_ASPECT_RATIO_STORAGE_KEY, imageAspectRatio);
    else window.localStorage.removeItem(IMAGE_ASPECT_RATIO_STORAGE_KEY);
    window.localStorage.setItem(IMAGE_RESOLUTION_STORAGE_KEY, imageResolution);
    window.localStorage.setItem(IMAGE_CUSTOM_RATIO_STORAGE_KEY, imageCustomRatio);
    window.localStorage.setItem(IMAGE_CUSTOM_WIDTH_STORAGE_KEY, imageCustomWidth);
    window.localStorage.setItem(IMAGE_CUSTOM_HEIGHT_STORAGE_KEY, imageCustomHeight);
    if (imageSize) window.localStorage.setItem(IMAGE_SIZE_STORAGE_KEY, imageSize);
    else window.localStorage.removeItem(IMAGE_SIZE_STORAGE_KEY);
  }, [imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSize, imageSizeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IMAGE_QUALITY_STORAGE_KEY, imageQuality);
  }, [imageQuality]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IMAGE_OUTPUT_FORMAT_STORAGE_KEY, imageOutputFormat);
    const normalizedCompression = normalizeOutputCompressionValue(imageOutputCompression);
    if (normalizedCompression === undefined || imageOutputFormat === "png") {
      window.localStorage.removeItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY, String(normalizedCompression));
  }, [imageOutputCompression, imageOutputFormat]);
}
