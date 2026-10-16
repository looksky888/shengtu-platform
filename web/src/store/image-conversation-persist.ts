import type { ImageConversation, StoredImage, StoredReferenceImage } from "@/store/image-conversation-types";
import { IMAGE_CONVERSATION_SCHEMA_VERSION } from "@/store/image-conversation-types";

/** Max data-URL length kept for reference images in IndexedDB (bytes of string). */
const MAX_PERSISTED_DATA_URL_CHARS = 48_000;

/**
 * Prepare a conversation for durable IndexedDB storage.
 * - Never store result base64 (b64_json); keep server url/path only.
 * - Cap/strip large reference data URLs so quota is not blown.
 * In-memory React state may still hold full data for the active session.
 */
export function conversationForPersistence(conversation: ImageConversation): ImageConversation {
  return {
    ...conversation,
    schemaVersion: IMAGE_CONVERSATION_SCHEMA_VERSION,
    turns: conversation.turns.map((turn) => ({
      ...turn,
      images: turn.images.map(stripImageBase64),
      referenceImages: turn.referenceImages.map(stripHeavyReferenceDataUrl),
    })),
  };
}

function stripImageBase64(image: StoredImage): StoredImage {
  if (!image.b64_json) {
    return image;
  }
  // Prefer URL/path for history; drop base64 payload.
  const { b64_json: _drop, ...rest } = image;
  return rest;
}

function stripHeavyReferenceDataUrl(ref: StoredReferenceImage): StoredReferenceImage {
  const dataUrl = ref.dataUrl || "";
  if (!dataUrl.startsWith("data:")) {
    return ref;
  }
  if (dataUrl.length <= MAX_PERSISTED_DATA_URL_CHARS) {
    return ref;
  }
  // Keep metadata so UI can show "需重新上传"; do not keep multi-MB base64.
  return {
    name: ref.name,
    type: ref.type,
    dataUrl: "",
    source: ref.source,
  };
}
