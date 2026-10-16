import {
  IMAGE_ASPECT_RATIO_FILTERS,
  IMAGE_RESOLUTION_FILTERS,
  type ImageAspectRatioFilter,
  type ImageFormatFilter,
  type ImageOrientationFilter,
  type ImageResolutionFilter,
  type ImageVisibilityFilter,
} from "@/app/image-manager/image-manager-types";
import type { ImageVisibility, ManagedImage } from "@/lib/api";
import { formatImageFileSize } from "@/lib/image-size";
import { downloadImageBlob, downloadImageFiles, type ImageDownloadProgress } from "@/lib/image-download";
import type { StoredAuthSession } from "@/store/auth";

export function getManagedImageFormatLabel(item: ManagedImage) {
  const normalized = (item.name || item.url).split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1] || "image";
  const format = normalized.toLowerCase() === "jpeg" ? "jpg" : normalized.toLowerCase();
  return `IMAGE ${format.toUpperCase()}`;
}

export function managedImageKey(item: ManagedImage) {
  return item.path;
}

function buildManagedImageDownloadName(item: ManagedImage, index: number) {
  const sourceName = item.name || item.url.split("?")[0]?.split("/").filter(Boolean).pop();
  if (sourceName) {
    return sourceName;
  }
  return `managed-image-${String(index + 1).padStart(2, "0")}.png`;
}

export async function downloadManagedImage(item: ManagedImage, index: number) {
	await downloadImageBlob(item.url, buildManagedImageDownloadName(item, index));
}

export async function downloadManagedImages(
	items: ManagedImage[],
	allItems: ManagedImage[],
	onProgress?: (progress: ImageDownloadProgress) => void,
) {
	return downloadImageFiles(items.map((item) => ({
		src: item.url,
		fileName: buildManagedImageDownloadName(item, allItems.indexOf(item)),
	})), onProgress);
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isRequestCanceled(error: unknown) {
  return error instanceof Error && error.message === "canceled";
}

export function latestManagedImageUpdatedStamp(items: ManagedImage[]) {
  let best = "";
  for (const item of items) {
    const stamp = (item as ManagedImage & { updated_at?: string }).updated_at || item.published_at || item.created_at || "";
    if (stamp > best) best = stamp;
  }
  return best;
}

export function mergeManagedImagesByPath(existing: ManagedImage[], incoming: ManagedImage[]) {
  const map = new Map(existing.map((item) => [item.path, item]));
  for (const item of incoming) {
    map.set(item.path, { ...map.get(item.path), ...item });
  }
  return Array.from(map.values()).sort((a, b) => {
    const left = a.published_at || a.created_at || "";
    const right = b.published_at || b.created_at || "";
    return right.localeCompare(left);
  });
}

export function imageManagerCacheScope(session: StoredAuthSession) {
  return [session.provider || "local", session.role, session.subjectId || session.key].join(":");
}

export function getManagedImageFormat(item: ManagedImage) {
  const extension = (item.name || item.url || item.path).split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension) {
    return "other";
  }
  if (extension === "jpeg") {
    return "jpg";
  }
  return ["png", "jpg", "webp", "gif"].includes(extension) ? extension : "other";
}

export function imageOwnerLabel(item: ManagedImage) {
  return item.owner_name?.trim() || "未知用户";
}

export function getManagedImageOrientation(item: ManagedImage): ImageOrientationFilter {
  if (!item.width || !item.height) {
    return "unknown";
  }
  if (item.width === item.height) {
    return "square";
  }
  return item.width > item.height ? "landscape" : "portrait";
}

function managedImageDimensions(item: ManagedImage) {
  const width = Number(item.width);
  const height = Number(item.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function getManagedImageResolution(item: ManagedImage) {
  const dimensions = managedImageDimensions(item);
  return dimensions ? `${dimensions.width} x ${dimensions.height}` : "";
}

function getManagedImageMegapixels(item: ManagedImage) {
  const dimensions = managedImageDimensions(item);
  if (!dimensions) {
    return 0;
  }
  return (dimensions.width * dimensions.height) / 1_000_000;
}

export function getManagedImageResolutionFilter(item: ManagedImage): ImageResolutionFilter {
  const preset = normalizeManagedImageResolutionPreset(item.resolution_preset);
  if (preset) {
    return preset;
  }
  const dimensions = managedImageDimensions(item);
  if (!dimensions) {
    return "unknown";
  }
  const longSide = Math.max(dimensions.width, dimensions.height);
  const shortSide = Math.min(dimensions.width, dimensions.height);
  if (longSide >= 3200 || shortSide >= 2400) {
    return "4k";
  }
  if (longSide >= 1600 || shortSide >= 1400) {
    return "2k";
  }
  return "1080p";
}

function normalizeManagedImageResolutionPreset(value: unknown): Exclude<ImageResolutionFilter, "all" | "unknown"> | "" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "1080p" || normalized === "2k" || normalized === "4k") {
    return normalized;
  }
  return "";
}

function imageResolutionPresetLabel(item: ManagedImage) {
  const preset = getManagedImageResolutionFilter(item);
  if (preset === "all" || preset === "unknown") {
    return "";
  }
  return imageResolutionFilterLabel(preset);
}

export function getManagedImageAspectRatio(item: ManagedImage) {
  const dimensions = managedImageDimensions(item);
  if (!dimensions) {
    return "";
  }
  return item.aspect_ratio || simplifyAspectRatio(dimensions.width, dimensions.height);
}

export function getManagedImageAspectRatioFilter(item: ManagedImage): ImageAspectRatioFilter {
  const ratio = getManagedImageAspectRatio(item);
  if (!ratio) {
    return "unknown";
  }
  if (["1:1", "4:3", "3:4", "16:9", "9:16"].includes(ratio)) {
    return ratio as ImageAspectRatioFilter;
  }
  return "other";
}

function simplifyAspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(Math.round(width), Math.round(height));
  if (divisor <= 0) {
    return "";
  }
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

export function imageResolutionFilterLabel(value: ImageResolutionFilter) {
  return IMAGE_RESOLUTION_FILTERS.find((item) => item.value === value)?.label ?? "全部分辨率";
}

export function imageAspectRatioFilterLabel(value: ImageAspectRatioFilter) {
  return IMAGE_ASPECT_RATIO_FILTERS.find((item) => item.value === value)?.label ?? "全部比例";
}

export function formatManagedImageMegapixels(item: ManagedImage) {
  const megapixels = getManagedImageMegapixels(item);
  if (megapixels <= 0) {
    return "";
  }
  return megapixels >= 10 ? `${megapixels.toFixed(1)}MP` : `${megapixels.toFixed(2)}MP`;
}

export function getManagedImageResolutionSummary(item: ManagedImage) {
  return [getManagedImageResolution(item), getManagedImageAspectRatio(item), formatManagedImageMegapixels(item)].filter(Boolean).join(" · ");
}

export function imageFormatFilterLabel(format: ImageFormatFilter) {
  const labels: Record<ImageFormatFilter, string> = {
    all: "全部格式",
    png: "PNG",
    jpg: "JPG",
    webp: "WEBP",
    gif: "GIF",
    other: "其他",
  };
  return labels[format];
}

export function imageOrientationFilterLabel(orientation: ImageOrientationFilter) {
  const labels: Record<ImageOrientationFilter, string> = {
    all: "全部方向",
    landscape: "横图",
    portrait: "竖图",
    square: "方图",
    unknown: "未知尺寸",
  };
  return labels[orientation];
}

export function imageVisibilityFilterLabel(visibility: ImageVisibilityFilter) {
  if (visibility === "all") {
    return "全部状态";
  }
  return imageVisibilityLabel(visibility);
}

export function matchesManagedImageKeyword(item: ManagedImage, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return true;
  }
  return [
    item.name,
    item.path,
    item.url,
    item.owner_name,
    item.owner_id,
    item.created_at,
    item.date,
    getManagedImageResolution(item),
    imageResolutionPresetLabel(item),
    item.requested_size,
    getManagedImageAspectRatio(item),
    formatManagedImageMegapixels(item),
    formatImageFileSize(item.size),
  ].some((value) => String(value || "").toLowerCase().includes(normalizedKeyword));
}

export function imageVisibilityLabel(visibility: ImageVisibility) {
  return visibility === "public" ? "已公开" : "私有";
}

export function imageVisibilityPillClass(visibility: ImageVisibility) {
  return visibility === "public"
    ? "bg-[#e8f2ff] text-[#1456f0] ring-1 ring-[#bfdbfe]"
    : "bg-[#181e25]/82 text-white ring-1 ring-white/20";
}

export function imageVisibilityActionClass(visibility: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/95 text-[#1456f0] hover:bg-[#e8f2ff]"
    : "bg-white/95 text-stone-800 hover:bg-stone-100";
}

export function blurFocusedElementInContainer(container: HTMLElement) {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}
