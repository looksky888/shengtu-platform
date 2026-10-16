import type {
  ImageModel,
  ImageOutputFormat,
  ImageQuality,
  ImageVisibility,
} from "@/lib/api";

export type ImageConversationMode = "chat" | "generate" | "image" | "edit";
export type StoredReferenceImageSource = "upload" | "conversation";

export type StoredReferenceImage = {
  name: string;
  type: string;
  dataUrl: string;
  source?: StoredReferenceImageSource;
};

export type StoredImage = {
  id: string;
  taskId?: string;
  status?: "loading" | "success" | "error" | "cancelled" | "message";
  path?: string;
  visibility?: ImageVisibility;
  b64_json?: string;
  url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  outputFormat?: ImageOutputFormat;
  revised_prompt?: string;
  error?: string;
  text_response?: string;
};

export type ImageTurnStatus = "queued" | "generating" | "success" | "error" | "cancelled" | "message";

export type StoredImageSizeSelection = {
  mode: string;
  aspectRatio: string;
  resolution: string;
  customRatio?: string;
  customWidth: string;
  customHeight: string;
};

export type ImageTurn = {
  id: string;
  prompt: string;
  model: ImageModel;
  /** Display name captured at submission time for dynamic channel models. */
  modelLabel?: string;
  channelModelId?: string;
  channelName?: string;
  mode: ImageConversationMode;
  referenceImages: StoredReferenceImage[];
  count: number;
  size: string;
  sizeSelection?: StoredImageSizeSelection;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  visibility?: ImageVisibility;
  images: StoredImage[];
  createdAt: string;
  status: ImageTurnStatus;
  error?: string;
};

/** Bump when the stored conversation shape changes; readers normalize older payloads. */
export const IMAGE_CONVERSATION_SCHEMA_VERSION = 4 as const;

export type ImageConversation = {
  /** Present on newly written conversations (v2+). Missing means legacy v1 payload. */
  schemaVersion?: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ImageTurn[];
};

export type ImageConversationStats = {
  queued: number;
  running: number;
};
