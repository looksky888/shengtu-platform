"use client";

import localforage from "localforage";

import {
  normalizeConversation,
  pickLatestConversation,
  sortImageConversations,
} from "@/store/image-conversation-normalize";
import { conversationForPersistence } from "@/store/image-conversation-persist";
import type {
  ImageConversation,
  ImageConversationStats,
} from "@/store/image-conversation-types";
import { getStoredAuthSession, type StoredAuthSession } from "@/store/auth";

export type {
  ImageConversation,
  ImageConversationMode,
  ImageConversationStats,
  ImageTurn,
  ImageTurnStatus,
  StoredImage,
  StoredImageSizeSelection,
  StoredReferenceImage,
  StoredReferenceImageSource,
} from "@/store/image-conversation-types";

const imageConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "image_conversations",
});

export const IMAGE_CONVERSATIONS_CHANGED_EVENT = "chatgpt2api:image-conversations-changed";
export const ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
export const IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT = "chatgpt2api:image-open-conversation";
const IMAGE_CONVERSATIONS_KEY_PREFIX = "items";
let imageConversationWriteQueue: Promise<void> = Promise.resolve();

function dispatchImageConversationsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(IMAGE_CONVERSATIONS_CHANGED_EVENT));
}

function conversationScopeFromSession(session: StoredAuthSession | null) {
  if (!session) {
    return "anonymous";
  }
  const subjectId = session.subjectId.trim();
  if (!subjectId) {
    return `${session.provider || "local"}:${session.role}:unknown`;
  }
  return `${session.provider || "local"}:${session.role}:${subjectId}`;
}

async function imageConversationsStorageKey() {
  const session = await getStoredAuthSession();
  return `${IMAGE_CONVERSATIONS_KEY_PREFIX}:${conversationScopeFromSession(session)}`;
}

function queueImageConversationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = imageConversationWriteQueue.then(operation);
  imageConversationWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readStoredImageConversations(storageKey?: string): Promise<ImageConversation[]> {
  storageKey = storageKey || await imageConversationsStorageKey();
  const items =
    (await imageConversationStorage.getItem<Array<ImageConversation & Record<string, unknown>>>(
      storageKey,
    )) || [];
  return items.map(normalizeConversation);
}

export async function listImageConversations(): Promise<ImageConversation[]> {
  return sortImageConversations(await readStoredImageConversations());
}

export async function saveImageConversations(conversations: ImageConversation[]): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    const conversationMap = new Map(items.map((item) => [item.id, item]));
    for (const conversation of conversations.map(normalizeConversation)) {
      const current = conversationMap.get(conversation.id);
      // Merge full in-memory shape, then strip base64 only for disk.
      const merged = current ? pickLatestConversation(current, conversation) : conversation;
      conversationMap.set(conversation.id, conversationForPersistence(merged));
    }
    await imageConversationStorage.setItem(
      storageKey,
      sortImageConversations([...conversationMap.values()]),
    );
    dispatchImageConversationsChanged();
  });
}

export async function saveImageConversation(conversation: ImageConversation): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    const nextConversation = normalizeConversation(conversation);
    const current = items.find((item) => item.id === nextConversation.id);
    const merged = current ? pickLatestConversation(current, nextConversation) : nextConversation;
    // Disk: no result base64; heavy reference data URLs capped.
    const persistedConversation = conversationForPersistence(merged);
    const nextItems = sortImageConversations([
      persistedConversation,
      ...items.filter((item) => item.id !== persistedConversation.id),
    ]);
    await imageConversationStorage.setItem(storageKey, nextItems);
    dispatchImageConversationsChanged();
  });
}

export async function deleteImageConversation(id: string): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    await imageConversationStorage.setItem(
      storageKey,
      items.filter((item) => item.id !== id),
    );
    dispatchImageConversationsChanged();
  });
}

export async function clearImageConversations(): Promise<void> {
  await queueImageConversationWrite(async () => {
    await imageConversationStorage.removeItem(await imageConversationsStorageKey());
    dispatchImageConversationsChanged();
  });
}

export function getImageConversationStats(conversation: ImageConversation | null): ImageConversationStats {
  if (!conversation) {
    return { queued: 0, running: 0 };
  }

  return conversation.turns.reduce(
    (acc, turn) => {
      if (turn.status === "queued") {
        acc.queued += 1;
      } else if (turn.status === "generating") {
        acc.running += 1;
      }
      return acc;
    },
    { queued: 0, running: 0 },
  );
}
