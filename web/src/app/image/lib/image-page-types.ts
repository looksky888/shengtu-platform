import type { ImageOutputFormat, ImageQuality } from "@/lib/api";

export { dispatchQuotaRefresh, QUOTA_REFRESH_EVENT } from "@/lib/quota-events";
export const DEFAULT_IMAGE_QUALITY: ImageQuality = "high";
export const DEFAULT_IMAGE_OUTPUT_FORMAT: ImageOutputFormat = "png";
export const EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE = "__empty_aspect_ratio__";
export const MISSING_RECOVERABLE_TASK_ID_ERROR = "页面刷新或任务中断，未找到可恢复的任务 ID";

export type ComposerMode = "chat" | "image";

export type ImageCreditCosts = {
  "1080p": number;
  "2k": number;
  "4k": number;
  gptImage2: number;
  gptImage25: number;
  gptImage25Flare: number;
  gptImage25Sunburst: number;
  gptImage26: number;
  gptImage26Flare: number;
  gptImage26Sunburst: number;
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
  gptImage26: 5,
  gptImage26Flare: 5,
  gptImage26Sunburst: 5,
  grok1k: 1,
  grok2k: 2,
};
