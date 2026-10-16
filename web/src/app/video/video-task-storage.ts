import type { StoredAuthSession } from "@/store/auth";

const VIDEO_TASK_KEY_PREFIX = "shengtu_last_video_task_id";
export const LEGACY_VIDEO_TASK_KEY = VIDEO_TASK_KEY_PREFIX;

export function videoTaskStorageKey(session: StoredAuthSession | null | undefined) {
  const subjectID = String(session?.subjectId || "").trim();
  if (!subjectID) return "";
  const provider = String(session?.provider || "default").trim() || "default";
  return `${VIDEO_TASK_KEY_PREFIX}:${encodeURIComponent(provider)}:${encodeURIComponent(subjectID)}`;
}
