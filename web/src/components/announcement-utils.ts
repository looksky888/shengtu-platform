import type { Announcement } from "@/lib/api";
import { chinaTodayKey, formatDateTime } from "@/lib/datetime";

const ANNOUNCEMENT_MUTE_PREFIX = "chatgpt2api:announcement:mute:";

export function todayKey() {
  return chinaTodayKey();
}

export function muteStorageKey(announcementId: string) {
  return `${ANNOUNCEMENT_MUTE_PREFIX}${announcementId}`;
}

export function formatAnnouncementDate(value?: string | null) {
  if (!value) return "最新公告";
  const text = formatDateTime(value, { compact: true });
  return text === "—" ? "最新公告" : text;
}

export function getAnnouncementTitle(announcement: Announcement, index?: number) {
  const fallback = typeof index === "number" ? `公告 ${index + 1}` : "公告";
  return announcement.title.trim() || fallback;
}
