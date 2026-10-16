export const CUSTOM_IMAGE_ASPECT_RATIO = "custom";
export const DEFAULT_IMAGE_CUSTOM_RATIO = "16:9";

export const IMAGE_ASPECT_RATIO_OPTIONS = [{ value: "", label: "Auto" }, { value: "1:1", label: "1:1 (\u6b63\u65b9\u5f62)" }, { value: "3:2", label: "3:2 (\u6a2a\u56fe)" }, { value: "2:3", label: "2:3 (\u7ad6\u56fe)" }, { value: "16:9", label: "16:9 (\u5bbd\u5c4f)" }, { value: "21:9", label: "21:9 (\u8d85\u5bbd\u5c4f)" }, { value: "4:3", label: "4:3 (\u6a2a\u56fe)" }, { value: "3:4", label: "3:4 (\u7ad6\u56fe)" }, { value: "9:16", label: "9:16 (\u624b\u673a\u7ad6\u5c4f)" }, { value: CUSTOM_IMAGE_ASPECT_RATIO, label: "\u81ea\u5b9a\u4e49\u6bd4\u4f8b" }] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_OPTIONS)[number]["value"];

export const IMAGE_SIZE_MODE_OPTIONS = [{ value: "auto", label: "Auto" }, { value: "ratio", label: "\u6bd4\u4f8b" }, { value: "custom", label: "\u624b\u52a8\u5c3a\u5bf8" }] as const;

export type ImageSizeMode = (typeof IMAGE_SIZE_MODE_OPTIONS)[number]["value"];

export const IMAGE_RESOLUTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1k", label: "1K（标准）" },
  { value: "1080p", label: "1080P" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
] as const;

export const GPT_IMAGE_RESOLUTION_OPTIONS = [{ value: "1k", label: "1K（标准）" }] as const;

// Edit dialogs and legacy callers use the complete resolution list. The
// creation composer selects the GPT-specific list above and keeps Grok's list
// separate, while this alias preserves the shared editor contract.
export const IMAGE_RATIO_RESOLUTION_OPTIONS = IMAGE_RESOLUTION_OPTIONS;

/** Grok-friendly sizes for studio presets (credit preview / request size). */
export const GROK_IMAGE_ASPECT_RATIO_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "1:1", label: "1:1 (正方形)" },
  { value: "16:9", label: "16:9 (宽屏)" },
  { value: "9:16", label: "9:16 (竖屏)" },
  { value: "3:2", label: "3:2 (横图)" },
  { value: "2:3", label: "2:3 (竖图)" },
  { value: "4:3", label: "4:3 (横图)" },
  { value: "3:4", label: "3:4 (竖图)" },
] as const;

export const GROK_IMAGE_RESOLUTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1k", label: "1K（标准）" },
  { value: "2k", label: "2K（高清）" },
] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTION_OPTIONS)[number]["value"];

export type ImageSizeSelection = {
  mode: ImageSizeMode;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  customRatio: string;
  customWidth: string;
  customHeight: string;
};

export const DEFAULT_IMAGE_CUSTOM_WIDTH = "1024";
export const DEFAULT_IMAGE_CUSTOM_HEIGHT = "1024";

export const IMAGE_QUALITY_OPTIONS = [{ value: "low", label: "Low", description: "\u901f\u5ea6\u4f18\u5148\uff0c\u9002\u5408\u8349\u56fe\u9884\u89c8" }, { value: "medium", label: "Medium", description: "\u5e73\u8861\u8d28\u91cf\u4e0e\u901f\u5ea6\uff0c\u9002\u5408\u65e5\u5e38\u751f\u6210" }, { value: "high", label: "High", description: "\u9ad8\u8d28\u91cf\u8f93\u51fa\uff0c\u9002\u5408\u6700\u7ec8\u51fa\u56fe" }] as const;
