import type {
  IMAGE_CONVERSATION_SCHEMA_VERSION,
  ImageConversation,
  StoredImage,
  StoredReferenceImage,
} from "@/store/image-conversation-types";

const PERSISTED_CONVERSATION_SCHEMA_VERSION: typeof IMAGE_CONVERSATION_SCHEMA_VERSION = 5;

/** Max data-URL length kept per reference image in IndexedDB (~1.8 MB binary). */
export const MAX_PERSISTED_DATA_URL_LENGTH = 2_500_000;
/** Total data-URL budget kept across recent turns in a single conversation (~6 MB binary). */
export const MAX_CONVERSATION_DATA_URL_LENGTH = 8_000_000;

/**
 * Prepare a conversation for durable IndexedDB storage.
 * - Never store result base64 (b64_json); keep server url/path only.
 * - Keep normal reference uploads & masks intact in IndexedDB up to practical per-image
 *   and per-conversation limits, prioritizing the most recent turns.
 * - When oversized/older reference data URLs are stripped, preserve `stripped: true` and metadata.
 * In-memory React state may still hold full data for the active session.
 */
export function conversationForPersistence(conversation: ImageConversation): ImageConversation {
  let remainingBudget = MAX_CONVERSATION_DATA_URL_LENGTH;
  const persistedTurns = new Array<ImageConversation["turns"][number]>(conversation.turns.length);

  for (let turnIndex = conversation.turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = conversation.turns[turnIndex];
    const referenceImages = turn.referenceImages.map((ref) => {
      const persisted = persistReferenceImageWithBudget(ref, remainingBudget);
      if (persisted.dataUrl.startsWith("data:")) {
        remainingBudget = Math.max(0, remainingBudget - persisted.dataUrl.length);
      }
      return persisted;
    });
    persistedTurns[turnIndex] = {
      ...turn,
      images: turn.images.map(stripImageBase64),
      referenceImages,
    };
  }

  return {
    ...conversation,
    schemaVersion: PERSISTED_CONVERSATION_SCHEMA_VERSION,
    turns: persistedTurns,
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

function toStrippedReferenceMetadata(ref: StoredReferenceImage): StoredReferenceImage {
  const mimeType = ref.mimeType || ref.type || "image/png";
  return {
    ...(ref.id ? { id: ref.id } : {}),
    name: ref.name || "reference.png",
    type: ref.type || mimeType,
    mimeType,
    dataUrl: "",
    ...(ref.source ? { source: ref.source } : {}),
    stripped: true,
  };
}

function persistReferenceImageWithBudget(
  ref: StoredReferenceImage,
  remainingBudget: number,
): StoredReferenceImage {
  const dataUrl = ref.dataUrl || "";
  if (!dataUrl) {
    return toStrippedReferenceMetadata(ref);
  }
  if (!dataUrl.startsWith("data:")) {
    return ref.stripped ? { ...ref, stripped: undefined } : ref;
  }
  if (dataUrl.length <= MAX_PERSISTED_DATA_URL_LENGTH && dataUrl.length <= remainingBudget) {
    return ref.stripped ? { ...ref, stripped: undefined } : ref;
  }
  // Keep metadata + stripped flag so UI can show subtle hint without deleting reference entry.
  return toStrippedReferenceMetadata(ref);
}
