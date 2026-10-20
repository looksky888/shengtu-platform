import type { ImageConversation } from "@/store/image-conversation-types";

/**
 * Conversation write arbitration.
 *
 * `updatedAt` is a *display* timestamp: mutations (and whole code paths) may legitimately
 * leave it untouched, so it must never decide which concurrent write survives — a write
 * carrying fresh content with a stale timestamp used to be dropped wholesale (losing
 * `taskId` / `generating` state and causing duplicate paid resubmits).
 *
 * Every write therefore advances a monotonic `revision`, and the stored copy only wins
 * when its revision is strictly newer (i.e. the incoming write was built from an older
 * snapshot). Payloads written before revisions existed read as 0 and still arbitrate by
 * timestamp.
 */

/** Missing/legacy revisions read as 0 so old payloads keep the timestamp comparison. */
export function conversationRevision(conversation: { revision?: number }) {
  const revision = Number(conversation.revision);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

/** Advance the write revision without touching the display timestamp. */
export function advanceConversationRevision<T extends { revision?: number }>(conversation: T): T & { revision: number } {
  return { ...conversation, revision: conversationRevision(conversation) + 1 };
}

export type ConversationMutation = Omit<Partial<ImageConversation>, "revision" | "updatedAt">;

/**
 * Single mutation entry point: advance the revision and stamp `updatedAt` for a
 * user-visible change. Mutations must go through this so no path can forget the version.
 */
export function touchConversation(
  conversation: Omit<ImageConversation, "revision"> & { revision?: number },
  changes: ConversationMutation = {},
  updatedAt = new Date().toISOString(),
): ImageConversation {
  return { ...conversation, ...changes, revision: conversationRevision(conversation) + 1, updatedAt };
}

function timestampOf(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function pickLatestConversation(current: ImageConversation, next: ImageConversation): ImageConversation {
  const currentRevision = conversationRevision(current);
  const nextRevision = conversationRevision(next);
  if (currentRevision !== nextRevision) {
    return nextRevision > currentRevision ? next : current;
  }
  return timestampOf(next.updatedAt) >= timestampOf(current.updatedAt) ? next : current;
}
