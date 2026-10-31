import type { Announcement } from "@/lib/api";

const ANNOUNCEMENT_MUTE_PREFIX = "chatgpt2api:announcement:mute:";
const ANNOUNCEMENT_SEEN_BROADCAST_PREFIX =
  "chatgpt2api:announcement:seen-broadcast:";

export function normalizePopupVersion(version?: number | null): number {
  const parsed = Math.trunc(Number(version));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function legacyMuteStorageKey(announcementId: string) {
  return `${ANNOUNCEMENT_MUTE_PREFIX}${announcementId}`;
}

export function muteStorageKey(
  announcementId: string,
  popupVersion?: number | null,
) {
  return `${ANNOUNCEMENT_MUTE_PREFIX}${announcementId}:v${normalizePopupVersion(popupVersion)}`;
}

export function seenBroadcastStorageKey(
  announcementId: string,
  popupVersion?: number | null,
) {
  return `${ANNOUNCEMENT_SEEN_BROADCAST_PREFIX}${announcementId}:v${normalizePopupVersion(popupVersion)}`;
}

export function isAnnouncementMutedToday(
  announcement: Pick<
    Announcement,
    "id" | "popup_version" | "last_broadcast_at"
  >,
  today: string,
  storage: Pick<Storage, "getItem"> | null =
    typeof window !== "undefined" ? window.localStorage : null,
): boolean {
  if (!storage) return false;
  try {
    const version = normalizePopupVersion(announcement.popup_version);
    if (storage.getItem(muteStorageKey(announcement.id, version)) === today) {
      return true;
    }
    if (
      version === 1 &&
      !announcement.last_broadcast_at &&
      storage.getItem(legacyMuteStorageKey(announcement.id)) === today
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function hasUnseenBroadcast(
  announcement: Pick<
    Announcement,
    "id" | "popup_version" | "last_broadcast_at"
  >,
  storage: Pick<Storage, "getItem"> | null =
    typeof window !== "undefined" ? window.localStorage : null,
): boolean {
  const broadcastAt = String(announcement.last_broadcast_at || "").trim();
  if (!broadcastAt) return false;
  if (!storage) return true;
  try {
    const key = seenBroadcastStorageKey(
      announcement.id,
      announcement.popup_version,
    );
    return storage.getItem(key) !== broadcastAt;
  } catch {
    return true;
  }
}

export function markBroadcastSeen(
  announcement: Pick<
    Announcement,
    "id" | "popup_version" | "last_broadcast_at"
  >,
  storage: Pick<Storage, "setItem"> | null =
    typeof window !== "undefined" ? window.localStorage : null,
): void {
  const broadcastAt = String(announcement.last_broadcast_at || "").trim();
  if (!broadcastAt || !storage) return;
  try {
    storage.setItem(
      seenBroadcastStorageKey(announcement.id, announcement.popup_version),
      broadcastAt,
    );
  } catch {
    // ignore storage failures
  }
}
