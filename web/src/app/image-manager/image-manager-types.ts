import type { ImageVisibility } from "@/lib/api";

export type DeleteImageTarget = {
  paths: string[];
};

export type ImageVisibilityFilter = "all" | ImageVisibility;
export type ImageFormatFilter = "all" | "png" | "jpg" | "webp" | "gif" | "other";
export type ImageOrientationFilter = "all" | "landscape" | "portrait" | "square" | "unknown";
export type ImageResolutionFilter = "all" | "1080p" | "2k" | "4k" | "unknown";
export type ImageAspectRatioFilter = "all" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "other" | "unknown";
export type AutoRefreshMenuScope = "mobile" | "desktop";

export const IMAGE_RESOLUTION_FILTERS: Array<{ value: ImageResolutionFilter; label: string }> = [
  { value: "all", label: "全部分辨率" },
  { value: "1080p", label: "1080P" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
  { value: "unknown", label: "未知尺寸" },
];

export const IMAGE_ASPECT_RATIO_FILTERS: Array<{ value: ImageAspectRatioFilter; label: string }> = [
  { value: "all", label: "全部比例" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "other", label: "其他比例" },
  { value: "unknown", label: "未知尺寸" },
];

/** Server page size for /api/images true pagination (replace, not append). */
// Keep the first gallery response small enough that opening the library stays responsive.
// Pagination remains available for older items and the server still reports the full total.
export const IMAGE_MANAGER_SERVER_PAGE_SIZE = 40;
export const AUTO_REFRESH_INTERVAL_OPTIONS = [5, 10, 15, 30] as const;

export type ImageAutoRefreshInterval = (typeof AUTO_REFRESH_INTERVAL_OPTIONS)[number];
