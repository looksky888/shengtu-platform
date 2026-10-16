import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  isChatModel,
  isImageCreationModel,
  isImageModel,
  isImageOutputFormat,
  isImageQuality,
  type ImageVisibility,
} from "@/lib/api";
import { getManagedImagePathFromUrl } from "@/lib/image-path";
import type {
  ImageConversation,
  ImageConversationMode,
  ImageTurn,
  ImageTurnStatus,
  StoredImage,
  StoredImageSizeSelection,
  StoredReferenceImage,
} from "@/store/image-conversation-types";
import { IMAGE_CONVERSATION_SCHEMA_VERSION } from "@/store/image-conversation-types";
import { resolveImageModel } from "@/app/image/lib/image-model-selection";

function normalizeStoredImage(image: StoredImage): StoredImage {
  const url = typeof image.url === "string" && image.url ? image.url : undefined;
  const width = Number(image.width);
  const height = Number(image.height);
  const resolution = typeof image.resolution === "string" && image.resolution ? image.resolution : undefined;
  const normalized = {
    ...image,
    taskId: typeof image.taskId === "string" && image.taskId ? image.taskId : undefined,
    path:
      typeof image.path === "string" && image.path
        ? image.path
        : url
          ? getManagedImagePathFromUrl(url) || undefined
          : undefined,
    visibility:
      image.visibility === "public" || image.visibility === "private" ? image.visibility : undefined,
    url,
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
    resolution,
    outputFormat: isImageOutputFormat(image.outputFormat) ? image.outputFormat : undefined,
    revised_prompt: typeof image.revised_prompt === "string" ? image.revised_prompt : undefined,
    text_response: typeof image.text_response === "string" && image.text_response ? image.text_response : undefined,
  };
  if (image.status === "loading" || image.status === "error" || image.status === "success" || image.status === "cancelled" || image.status === "message") {
    return normalized;
  }
  return {
    ...normalized,
    status: image.b64_json || image.url ? "success" : "loading",
  };
}

function normalizeReferenceImage(image: StoredReferenceImage & Record<string, unknown>): StoredReferenceImage {
  const source =
    image.source === "upload" || image.source === "conversation"
      ? image.source
      : undefined;
  return {
    name: image.name || "reference.png",
    type: image.type || "image/png",
    dataUrl: image.dataUrl,
    ...(source ? { source } : {}),
  };
}

function normalizeImageMode(value: unknown, referenceImages: StoredReferenceImage[]): ImageConversationMode {
  if (value === "chat") {
    return "chat";
  }
  if (value === "generate") {
    return "generate";
  }
  if (value === "image") {
    return "image";
  }
  if (value === "edit") {
    return referenceImages.some((image) => image.source === "conversation") ? "edit" : "image";
  }
  return referenceImages.length > 0 ? "image" : "generate";
}

function normalizeSizeSelection(value: unknown): StoredImageSizeSelection | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const selection = {
    mode: typeof source.mode === "string" ? source.mode : "",
    aspectRatio: typeof source.aspectRatio === "string" ? source.aspectRatio : "",
    resolution: typeof source.resolution === "string" ? source.resolution : "",
    customRatio: typeof source.customRatio === "string" ? source.customRatio : "",
    customWidth: typeof source.customWidth === "string" ? source.customWidth : "",
    customHeight: typeof source.customHeight === "string" ? source.customHeight : "",
  };
  if (
    !selection.mode &&
    !selection.aspectRatio &&
    !selection.resolution &&
    !selection.customRatio &&
    !selection.customWidth &&
    !selection.customHeight
  ) {
    return undefined;
  }
  return selection;
}

function normalizeOutputCompression(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return Math.min(100, Math.round(numeric));
}

function dataUrlMimeType(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,/);
  return match?.[1] || "image/png";
}

function getLegacyReferenceImages(source: Record<string, unknown>): StoredReferenceImage[] {
  if (Array.isArray(source.referenceImages)) {
    return source.referenceImages
      .filter((image): image is StoredReferenceImage => {
        if (!image || typeof image !== "object") {
          return false;
        }
        const candidate = image as StoredReferenceImage;
        return typeof candidate.dataUrl === "string" && candidate.dataUrl.length > 0;
      })
      .map(normalizeReferenceImage);
  }

  if (source.sourceImage && typeof source.sourceImage === "object") {
    const image = source.sourceImage as { dataUrl?: unknown; fileName?: unknown };
    if (typeof image.dataUrl === "string" && image.dataUrl) {
      return [
        {
          name: typeof image.fileName === "string" && image.fileName ? image.fileName : "reference.png",
          type: dataUrlMimeType(image.dataUrl),
          dataUrl: image.dataUrl,
          source: "upload",
        },
      ];
    }
  }

  return [];
}

function normalizeTurn(turn: ImageTurn & Record<string, unknown>): ImageTurn {
  const normalizedImages = Array.isArray(turn.images) ? turn.images.map(normalizeStoredImage) : [];
  const referenceImages = getLegacyReferenceImages(turn);
  const mode = normalizeImageMode(turn.mode, referenceImages);
  const sizeSelection = normalizeSizeSelection(turn.sizeSelection);
  const visibility: ImageVisibility = turn.visibility === "public" ? "public" : "private";
  const images = normalizedImages.map((image) =>
    image.visibility ? image : { ...image, visibility },
  );
  const channelModelId = typeof turn.channelModelId === "string" ? turn.channelModelId.trim() : "";
  const model = resolveImageModel({
    mode: mode === "chat" ? "chat" : "image",
    requestedModel: turn.model,
    channelModelId: mode === "chat" ? undefined : channelModelId,
    defaultModel: mode === "chat" ? DEFAULT_CHAT_MODEL : DEFAULT_IMAGE_MODEL,
    isKnownModel: mode === "chat" ? isChatModel : isImageCreationModel,
  }) as ImageTurn["model"];
  const derivedStatus: ImageTurnStatus =
    images.some((image) => image.status === "loading")
      ? "generating"
      : images.some((image) => image.status === "error")
        ? "error"
        : images.some((image) => image.status === "cancelled")
          ? "cancelled"
          : images.some((image) => image.status === "message")
            ? "message"
            : "success";

  return {
    id: String(turn.id || `${Date.now()}`),
    prompt: String(turn.prompt || ""),
    model,
    ...(typeof turn.modelLabel === "string" && turn.modelLabel.trim() ? { modelLabel: turn.modelLabel.trim() } : {}),
    ...(channelModelId ? { channelModelId } : {}),
    ...(typeof turn.channelName === "string" && turn.channelName.trim() ? { channelName: turn.channelName.trim() } : {}),
    mode,
    referenceImages,
    count: Math.max(1, Number(turn.count || images.length || 1)),
    size: typeof turn.size === "string" ? turn.size : "",
    ...(sizeSelection ? { sizeSelection } : {}),
    quality: isImageQuality(turn.quality) ? turn.quality : undefined,
    outputFormat: isImageOutputFormat(turn.outputFormat) ? turn.outputFormat : undefined,
    outputCompression: normalizeOutputCompression(turn.outputCompression),
    visibility,
    images,
    createdAt: String(turn.createdAt || new Date().toISOString()),
    status:
      turn.status === "queued" ||
      turn.status === "generating" ||
      turn.status === "success" ||
      turn.status === "error" ||
      turn.status === "cancelled" ||
      turn.status === "message"
        ? turn.status
        : derivedStatus,
    error: typeof turn.error === "string" ? turn.error : undefined,
  };
}

export function normalizeConversation(conversation: ImageConversation & Record<string, unknown>): ImageConversation {
  const legacyReferenceImages = getLegacyReferenceImages(conversation);
  const legacyMode = normalizeImageMode(conversation.mode, legacyReferenceImages);
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.map((turn) => normalizeTurn(turn as ImageTurn & Record<string, unknown>))
    : [
        normalizeTurn({
          id: String(conversation.id || `${Date.now()}`),
          prompt: String(conversation.prompt || ""),
          model: isImageModel(conversation.model)
            ? conversation.model
            : legacyMode === "chat"
              ? DEFAULT_CHAT_MODEL
              : DEFAULT_IMAGE_MODEL,
          mode: legacyMode,
          referenceImages: legacyReferenceImages,
          count: Number(conversation.count || 1),
          size: typeof conversation.size === "string" ? conversation.size : "",
          quality: isImageQuality(conversation.quality) ? conversation.quality : undefined,
          outputFormat: isImageOutputFormat(conversation.outputFormat) ? conversation.outputFormat : undefined,
          outputCompression: normalizeOutputCompression(conversation.outputCompression),
          images: Array.isArray(conversation.images) ? (conversation.images as StoredImage[]) : [],
          createdAt: String(conversation.createdAt || new Date().toISOString()),
          status:
            conversation.status === "generating" || conversation.status === "success" || conversation.status === "error" || conversation.status === "message"
              ? conversation.status
              : "success",
          error: typeof conversation.error === "string" ? conversation.error : undefined,
        }),
      ];
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    schemaVersion: IMAGE_CONVERSATION_SCHEMA_VERSION,
    id: String(conversation.id || `${Date.now()}`),
    title: String(conversation.title || ""),
    createdAt: String(conversation.createdAt || lastTurn?.createdAt || new Date().toISOString()),
    updatedAt: String(conversation.updatedAt || lastTurn?.createdAt || new Date().toISOString()),
    turns,
  };
}

export function sortImageConversations(conversations: ImageConversation[]): ImageConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function pickLatestConversation(current: ImageConversation, next: ImageConversation) {
  return getTimestamp(next.updatedAt) >= getTimestamp(current.updatedAt) ? next : current;
}
