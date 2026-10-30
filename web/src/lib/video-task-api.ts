import type { CreationTask, CursorPage, ScopedCursorPage } from "@/lib/api-types";
import { assertCursorPage } from "@/lib/api-contract";
import { httpRequest } from "@/lib/request";

export type VideoGenerationRequest = {
  client_task_id: string;
  prompt: string;
  model: "grok-imagine-video" | "grok-imagine-video-1.5";
  seconds: 6 | 10 | 15;
  size: "720x1280" | "1280x720" | "1024x1024" | "1024x1792" | "1792x1024";
  resolution_name: "480p" | "720p";
  preset: "custom" | "normal" | "fun" | "spicy";
  image_reference?: string;
  reference_images?: string[];
};

export type VideoInputUpload = {
  input_reference: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  expires_at: string;
};

export type VideoReferenceAsset = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  url: string;
};

export type VideoAsset = {
  id: string;
  task_id: string;
  owner_id: string;
  owner_name: string;
  visibility: "private" | "public";
  prompt?: string;
  model: string;
  seconds: number;
  size: string;
  resolution_name: string;
  preset?: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  url: string;
};

export type VideoLibraryScope = "mine" | "public" | "all";

export type ProtocolVideo = {
  id: string;
  object: "video";
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  model?: string;
  created_at: number;
  seconds?: number;
  size?: string;
  resolution_name?: string;
  task_id: string;
  progress?: number;
  error?: string;
  content_url?: string;
};

export type ProtocolVideoList = {
  object: "list";
  data: ProtocolVideo[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
};

export async function submitVideoGeneration(payload: VideoGenerationRequest) {
  return httpRequest<CreationTask>("/api/creation-tasks/video-generations", {
    method: "POST",
    body: payload,
  });
}

export async function uploadVideoInput(image: File) {
  const body = new FormData();
  body.append("image", image);
  return httpRequest<VideoInputUpload>("/api/creation-tasks/video-inputs", {
    method: "POST",
    body,
  });
}

export async function fetchVideoReferenceAssets(options: { signal?: AbortSignal; cursor?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ limit: "50" });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const result = await httpRequest<CursorPage<VideoReferenceAsset>>(`/api/video-reference-assets?${params}`, { signal: options.signal });
  assertCursorPage<VideoReferenceAsset>(result, "参考图资产库");
  return result;
}

export async function uploadVideoReferenceAsset(image: File) {
  const body = new FormData();
  body.append("image", image);
  return httpRequest<VideoReferenceAsset>("/api/video-reference-assets", { method: "POST", body });
}

export async function deleteVideoReferenceAsset(id: string) {
  return httpRequest<{ deleted: boolean }>(`/api/video-reference-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchVideoAssets(scope: VideoLibraryScope, options: { signal?: AbortSignal; cursor?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ scope, limit: String(options.limit || 50) });
  if (options.cursor) params.set("cursor", options.cursor);
  const result = await httpRequest<ScopedCursorPage<VideoAsset, VideoLibraryScope>>(`/api/videos?${params}`, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: options.signal,
  });
  assertCursorPage<VideoAsset>(result, "视频库");
  if (result.scope !== scope) throw new Error("视频库范围返回错误");
  return result;
}

export async function deleteVideoAsset(taskID: string) {
  return httpRequest<{ deleted: boolean }>("/api/videos", {
    method: "DELETE",
    body: { id: taskID },
  });
}

export async function updateVideoVisibility(id: string, visibility: VideoAsset["visibility"]) {
  return httpRequest<{ item: VideoAsset }>("/api/videos/visibility", {
    method: "PATCH",
    body: { id, visibility },
  });
}

export function videoDownloadURL(asset: Pick<VideoAsset, "url">) {
  const separator = asset.url.includes("?") ? "&" : "?";
  return `${asset.url}${separator}download=1`;
}
