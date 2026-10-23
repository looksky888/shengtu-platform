import type { CreationTask } from "@/lib/api";
import type { VideoGenerationRequest } from "@/lib/video-task-api";
import type { StoredAuthSession } from "@/store/auth";

const VIDEO_TASK_KEY_PREFIX = "shengtu_last_video_task_id";
const VIDEO_RECENT_TAKES_KEY_PREFIX = "shengtu_recent_video_takes";

export const LEGACY_VIDEO_TASK_KEY = VIDEO_TASK_KEY_PREFIX;
export const MAX_RECENT_VIDEO_TAKES = 6;

export type RecentVideoTake = {
  taskId: string;
  prompt: string;
  ratio: string;
  size: VideoGenerationRequest["size"];
  seconds: VideoGenerationRequest["seconds"];
  resolutionName: VideoGenerationRequest["resolution_name"];
  preset: VideoGenerationRequest["preset"];
  model: VideoGenerationRequest["model"];
  status: CreationTask["status"];
  videoUrl?: string;
  createdAt: string;
};

const VALID_SIZES = new Set<VideoGenerationRequest["size"]>([
  "1280x720",
  "720x1280",
  "1024x1024",
  "1792x1024",
  "1024x1792",
]);

const SIZE_RATIO_MAP: Record<VideoGenerationRequest["size"], string> = {
  "1280x720": "16:9",
  "720x1280": "9:16",
  "1024x1024": "1:1",
  "1792x1024": "3:2",
  "1024x1792": "2:3",
};

const VALID_STATUSES = new Set<CreationTask["status"]>([
  "queued",
  "running",
  "success",
  "error",
  "cancelled",
]);

export function videoTaskStorageKey(session: StoredAuthSession | null | undefined) {
  const subjectID = String(session?.subjectId || "").trim();
  if (!subjectID) return "";
  const provider = String(session?.provider || "default").trim() || "default";
  return `${VIDEO_TASK_KEY_PREFIX}:${encodeURIComponent(provider)}:${encodeURIComponent(subjectID)}`;
}

export function recentVideoTakesStorageKey(session: StoredAuthSession | null | undefined) {
  const subjectID = String(session?.subjectId || "").trim();
  if (!subjectID) return "";
  const provider = String(session?.provider || "default").trim() || "default";
  return `${VIDEO_RECENT_TAKES_KEY_PREFIX}:${encodeURIComponent(provider)}:${encodeURIComponent(subjectID)}`;
}

export function normalizeVideoSize(value: unknown): VideoGenerationRequest["size"] {
  const candidate = String(value || "").trim() as VideoGenerationRequest["size"];
  return VALID_SIZES.has(candidate) ? candidate : "720x1280";
}

export function normalizeVideoSeconds(value: unknown): VideoGenerationRequest["seconds"] {
  const num = Number(value);
  if (num === 10 || num === 15) return num;
  return 6;
}

export function normalizeVideoResolution(
  value: unknown,
): VideoGenerationRequest["resolution_name"] {
  return String(value || "").toLowerCase() === "480p" ? "480p" : "720p";
}

export function normalizeVideoPreset(value: unknown): VideoGenerationRequest["preset"] {
  const candidate = String(value || "").trim();
  if (candidate === "normal" || candidate === "fun" || candidate === "spicy") {
    return candidate;
  }
  return "custom";
}

export function normalizeVideoModel(value: unknown): VideoGenerationRequest["model"] {
  return String(value || "").trim() === "grok-imagine-video"
    ? "grok-imagine-video"
    : "grok-imagine-video-1.5";
}

export function ratioForVideoSize(size: VideoGenerationRequest["size"]): string {
  return SIZE_RATIO_MAP[size] || "9:16";
}

function normalizeRecentTake(raw: unknown): RecentVideoTake | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const taskId = String(record.taskId || "").trim();
  if (!taskId) return null;
  const size = normalizeVideoSize(record.size);
  const statusCandidate = String(record.status || "success") as CreationTask["status"];
  const status = VALID_STATUSES.has(statusCandidate) ? statusCandidate : "success";
  const videoUrl = String(record.videoUrl || "").trim() || undefined;
  return {
    taskId,
    prompt: String(record.prompt || "").trim(),
    ratio: String(record.ratio || "").trim() || ratioForVideoSize(size),
    size,
    seconds: normalizeVideoSeconds(record.seconds),
    resolutionName: normalizeVideoResolution(record.resolutionName),
    preset: normalizeVideoPreset(record.preset),
    model: normalizeVideoModel(record.model),
    status,
    videoUrl,
    createdAt: String(record.createdAt || "").trim() || new Date().toISOString(),
  };
}

export function readRecentVideoTakes(storageKey: string): RecentVideoTake[] {
  if (typeof window === "undefined" || !storageKey) return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized: RecentVideoTake[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const take = normalizeRecentTake(item);
      if (!take || seen.has(take.taskId)) continue;
      seen.add(take.taskId);
      normalized.push(take);
      if (normalized.length >= MAX_RECENT_VIDEO_TAKES) break;
    }
    return normalized;
  } catch {
    return [];
  }
}

export function writeRecentVideoTakes(storageKey: string, takes: RecentVideoTake[]) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const trimmed = takes.slice(0, MAX_RECENT_VIDEO_TAKES);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
    }
  } catch {
    // Ignore quota or private-mode errors so in-memory takes continue working.
  }
}

export function upsertRecentVideoTake(
  current: RecentVideoTake[],
  incoming: RecentVideoTake,
  options: { moveToFront?: boolean } = {},
): RecentVideoTake[] {
  const existingIndex = current.findIndex((item) => item.taskId === incoming.taskId);
  if (existingIndex === -1) {
    return [incoming, ...current].slice(0, MAX_RECENT_VIDEO_TAKES);
  }
  const existing = current[existingIndex];
  const merged: RecentVideoTake = {
    ...existing,
    ...incoming,
    prompt: incoming.prompt || existing.prompt,
    videoUrl: incoming.videoUrl || existing.videoUrl,
  };
  if (options.moveToFront) {
    return [
      merged,
      ...current.filter((item) => item.taskId !== incoming.taskId),
    ].slice(0, MAX_RECENT_VIDEO_TAKES);
  }
  const next = [...current];
  next[existingIndex] = merged;
  return next.slice(0, MAX_RECENT_VIDEO_TAKES);
}
