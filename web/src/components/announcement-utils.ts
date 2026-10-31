import type { Announcement } from "@/lib/api";
import { chinaTodayKey, formatDateTime } from "@/lib/datetime";

import {
  hasUnseenBroadcast,
  isAnnouncementMutedToday as isAnnouncementMutedForDay,
  legacyMuteStorageKey,
  markBroadcastSeen,
  muteStorageKey,
  normalizePopupVersion,
  seenBroadcastStorageKey,
} from "./announcement-popup-state";

export {
  hasUnseenBroadcast,
  legacyMuteStorageKey,
  markBroadcastSeen,
  muteStorageKey,
  normalizePopupVersion,
  seenBroadcastStorageKey,
};

export function todayKey() {
  return chinaTodayKey();
}

export function isAnnouncementMutedToday(
  announcement: Pick<
    Announcement,
    "id" | "popup_version" | "last_broadcast_at"
  >,
  today = todayKey(),
  storage: Pick<Storage, "getItem"> | null =
    typeof window !== "undefined" ? window.localStorage : null,
): boolean {
  return isAnnouncementMutedForDay(announcement, today, storage);
}

export function formatAnnouncementDate(value?: string | null) {
  if (!value) return "最新公告";
  const text = formatDateTime(value, { compact: true });
  return text === "—" ? "最新公告" : text;
}

export function getAnnouncementTitle(
  announcement: Announcement,
  index?: number,
) {
  const fallback = typeof index === "number" ? `公告 ${index + 1}` : "公告";
  return announcement.title.trim() || fallback;
}
