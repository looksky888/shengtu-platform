import type { ImageAspectRatio, ImageResolution, ImageSizeMode } from "@/app/image/image-options";
import type { ImageModel, ImageOutputFormat, ImageQuality, ImageVisibility } from "@/lib/api";
import type { ImageConversationMode, StoredReferenceImage } from "@/store/image-conversations";

export { dispatchQuotaRefresh, QUOTA_REFRESH_EVENT } from "@/lib/quota-events";
export const DEFAULT_IMAGE_QUALITY: ImageQuality = "high";
export const DEFAULT_IMAGE_OUTPUT_FORMAT: ImageOutputFormat = "png";
export const activeConversationQueueIds = new Set<string>();
export const EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE = "__empty_aspect_ratio__";
export const MISSING_RECOVERABLE_TASK_ID_ERROR = "页面刷新或任务中断，未找到可恢复的任务 ID";

export type ComposerMode = "chat" | "image";

export type EditingTurnDraft = {
  conversationId: string;
  turnId: string;
  prompt: string;
  model: ImageModel;
  modelLabel?: string;
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
  gptImage2: number;
  gptImage25: number;
  gptImage25Flare: number;
  gptImage25Sunburst: number;
  grok1k: number;
  grok2k: number;
};

export const DEFAULT_IMAGE_CREDIT_COSTS: ImageCreditCosts = {
  "1080p": 1,
  "2k": 2,
  "4k": 3,
  gptImage2: 1,
  gptImage25: 2,
  gptImage25Flare: 3,
  gptImage25Sunburst: 3,
  grok1k: 1,
  grok2k: 2,
};
