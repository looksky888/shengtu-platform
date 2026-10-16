import { getImageSizeSelectionFromSize, isImageAspectRatio, isImageResolution, isImageSizeMode, type ImageSizeSelection } from "@/app/image/image-options";
import { DEFAULT_IMAGE_MODEL, isChatModel, isGrokImageModel, isImageCreationModel, isImageOutputFormat, isImageQuality, normalizeGrokStudioImageModel, type ImageModel, type ImageOutputFormat, type ImageQuality } from "@/lib/api";
import type { ImageConversation, StoredImageSizeSelection } from "@/store/image-conversations";

import { DEFAULT_IMAGE_OUTPUT_FORMAT, DEFAULT_IMAGE_QUALITY, type ComposerMode } from "./image-page-types";
import { normalizeOutputCompressionValue, normalizeRequestedImageCount } from "./image-turn-utils";

export const COMPOSER_MODE_STORAGE_KEY = "chatgpt2api:image_composer_mode";
export const IMAGE_MODEL_STORAGE_KEY = "chatgpt2api:image_last_model";
export const IMAGE_MODEL_OPTION_STORAGE_KEY = "chatgpt2api:image_last_model_option";
export const IMAGE_COUNT_STORAGE_KEY = "chatgpt2api:image_last_count";
export const IMAGE_SIZE_STORAGE_KEY = "chatgpt2api:image_last_size";
export const IMAGE_SIZE_MODE_STORAGE_KEY = "chatgpt2api:image_last_size_mode";
export const IMAGE_ASPECT_RATIO_STORAGE_KEY = "chatgpt2api:image_last_aspect_ratio";
export const IMAGE_RESOLUTION_STORAGE_KEY = "chatgpt2api:image_last_resolution";
export const IMAGE_CUSTOM_RATIO_STORAGE_KEY = "chatgpt2api:image_last_custom_ratio";
export const IMAGE_CUSTOM_WIDTH_STORAGE_KEY = "chatgpt2api:image_last_custom_width";
export const IMAGE_CUSTOM_HEIGHT_STORAGE_KEY = "chatgpt2api:image_last_custom_height";
export const IMAGE_QUALITY_STORAGE_KEY = "chatgpt2api:image_last_quality";
export const IMAGE_OUTPUT_FORMAT_STORAGE_KEY = "chatgpt2api:image_last_output_format";
export const IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY = "chatgpt2api:image_last_output_compression";

export function pickFallbackConversationId(conversations: ImageConversation[]) {
  const activeConversation = conversations.find((conversation) =>
    conversation.turns.some((turn) => turn.status === "queued" || turn.status === "generating"),
  );
  return activeConversation?.id ?? conversations[0]?.id ?? null;
}

export function sortImageConversations(conversations: ImageConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getStoredImageModel(): ImageModel {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_MODEL;
  }
  const storedModel = window.localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
  if (isChatModel(storedModel)) return storedModel;
  // Collapse any historical grok lite/pro selection to the single studio model.
  if (isGrokImageModel(storedModel)) {
    return normalizeGrokStudioImageModel(String(storedModel));
  }
  if (isImageCreationModel(storedModel)) {
    return storedModel;
  }
  return DEFAULT_IMAGE_MODEL;
}

export function getStoredImageCount() {
  if (typeof window === "undefined") {
    return "1";
  }
  return String(normalizeRequestedImageCount(window.localStorage.getItem(IMAGE_COUNT_STORAGE_KEY) || 1));
}

export function getStoredComposerMode(): ComposerMode {
  if (typeof window === "undefined") {
    return "image";
  }
  return window.localStorage.getItem(COMPOSER_MODE_STORAGE_KEY) === "chat" ? "chat" : "image";
}

export function getStoredImageQuality(): ImageQuality {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_QUALITY;
  }
  const storedQuality = window.localStorage.getItem(IMAGE_QUALITY_STORAGE_KEY);
  return isImageQuality(storedQuality) ? storedQuality : DEFAULT_IMAGE_QUALITY;
}

export function normalizeRatioResolutionSelection(selection: ImageSizeSelection): ImageSizeSelection {
  return selection;
}

export function getStoredImageModelOptionId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(IMAGE_MODEL_OPTION_STORAGE_KEY)?.trim() || "";
}

export function getStoredImageSizeSelection(): ImageSizeSelection {
  if (typeof window === "undefined") {
    return getImageSizeSelectionFromSize("");
  }
  const fallbackSelection = getImageSizeSelectionFromSize(window.localStorage.getItem(IMAGE_SIZE_STORAGE_KEY) || "");
  const storedSizeMode = window.localStorage.getItem(IMAGE_SIZE_MODE_STORAGE_KEY);
  const storedAspectRatio = window.localStorage.getItem(IMAGE_ASPECT_RATIO_STORAGE_KEY) || "";
  const storedResolution = window.localStorage.getItem(IMAGE_RESOLUTION_STORAGE_KEY);
  const customRatio = window.localStorage.getItem(IMAGE_CUSTOM_RATIO_STORAGE_KEY) || fallbackSelection.customRatio;
  const customWidth = window.localStorage.getItem(IMAGE_CUSTOM_WIDTH_STORAGE_KEY) || fallbackSelection.customWidth;
  const customHeight = window.localStorage.getItem(IMAGE_CUSTOM_HEIGHT_STORAGE_KEY) || fallbackSelection.customHeight;
  if (isImageSizeMode(storedSizeMode) && isImageAspectRatio(storedAspectRatio) && isImageResolution(storedResolution)) {
    return normalizeRatioResolutionSelection({ mode: storedSizeMode, aspectRatio: storedAspectRatio, resolution: storedResolution, customRatio, customWidth, customHeight });
  }
  return normalizeRatioResolutionSelection(fallbackSelection);
}

export function getStoredImageOutputFormat(): ImageOutputFormat {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_OUTPUT_FORMAT;
  }
  const storedFormat = window.localStorage.getItem(IMAGE_OUTPUT_FORMAT_STORAGE_KEY);
  return isImageOutputFormat(storedFormat) ? storedFormat : DEFAULT_IMAGE_OUTPUT_FORMAT;
}

export function getStoredImageOutputCompression(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const normalized = normalizeOutputCompressionValue(window.localStorage.getItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY));
  return normalized === undefined ? "" : String(normalized);
}

export function serializeImageSizeSelection(selection: ImageSizeSelection): StoredImageSizeSelection {
  return {
    mode: selection.mode,
    aspectRatio: selection.aspectRatio,
    resolution: selection.resolution,
    customRatio: selection.customRatio,
    customWidth: selection.customWidth,
    customHeight: selection.customHeight,
  };
}

export function restoreImageSizeSelection(stored: StoredImageSizeSelection | undefined, fallbackSize: string): ImageSizeSelection {
  const fallbackSelection = getImageSizeSelectionFromSize(fallbackSize);
  if (!stored) {
    return fallbackSelection;
  }
  return normalizeRatioResolutionSelection({
    mode: isImageSizeMode(stored.mode) ? stored.mode : fallbackSelection.mode,
    aspectRatio: isImageAspectRatio(stored.aspectRatio) ? stored.aspectRatio : fallbackSelection.aspectRatio,
    resolution: isImageResolution(stored.resolution) ? stored.resolution : fallbackSelection.resolution,
    customRatio: stored.customRatio || fallbackSelection.customRatio,
    customWidth: stored.customWidth || fallbackSelection.customWidth,
    customHeight: stored.customHeight || fallbackSelection.customHeight,
  });
}
