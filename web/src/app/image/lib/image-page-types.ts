import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import type { ImageModel, ImageOutputFormat, ImageQuality, ImageVisibility } from "@/lib/api";
import type { ImageConversationMode, StoredReferenceImage } from "@/store/image-conversations";

export const QUOTA_REFRESH_EVENT = "chatgpt2api:quota-refresh";
export const DEFAULT_IMAGE_QUALITY: ImageQuality = "high";
export const DEFAULT_IMAGE_OUTPUT_FORMAT: ImageOutputFormat = "png";
export const activeConversationQueueIds = new Set<string>();
export const EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE = "__empty_aspect_ratio__";
export const MISSING_RECOVERABLE_TASK_ID_ERROR = "页面刷新或任务中断，未找到可恢复的任务 ID";
export const GRAYSCALE_TEST_UNAVAILABLE_LABEL = "灰度测试未开放";

export type ComposerMode = "chat" | "image";

export type EditingTurnDraft = {
  conversationId: string;
  turnId: string;
  prompt: string;
  model: ImageModel;
  channelModelId?: string;
  channelName?: string;
  mode: ImageConversationMode;
  count: string;
  sizeMode: ImageSizeMode;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  customRatio: string;
  customWidth: string;
  customHeight: string;
  quality: ImageQuality;
  outputFormat: ImageOutputFormat;
  outputCompression: string;
  visibility: ImageVisibility;
  referenceImages: StoredReferenceImage[];
};

export type ImageCreditCosts = {
  "1080p": number;
  "2k": number;
  "4k": number;
  grok1k: number;
  grok2k: number;
};

export const DEFAULT_IMAGE_CREDIT_COSTS: ImageCreditCosts = { "1080p": 1, "2k": 2, "4k": 3, grok1k: 1, grok2k: 2 };
