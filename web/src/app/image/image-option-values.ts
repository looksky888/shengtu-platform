export const CUSTOM_IMAGE_ASPECT_RATIO = "custom";
export const DEFAULT_IMAGE_CUSTOM_RATIO = "16:9";

export const IMAGE_ASPECT_RATIO_OPTIONS = [{ value: "", label: "Auto" }, { value: "1:1", label: "1:1 (正方形)" }, { value: "3:2", label: "3:2 (横图)" }, { value: "2:3", label: "2:3 (竖图)" }, { value: "16:9", label: "16:9 (宽屏)" }, { value: "21:9", label: "21:9 (超宽屏)" }, { value: "4:3", label: "4:3 (横图)" }, { value: "3:4", label: "3:4 (竖图)" }, { value: "9:16", label: "9:16 (手机竖屏)" }, { value: CUSTOM_IMAGE_ASPECT_RATIO, label: "自定义比例" }] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_OPTIONS)[number]["value"];

export const IMAGE_SIZE_MODE_OPTIONS = [{ value: "auto", label: "Auto" }, { value: "ratio", label: "比例" }, { value: "custom", label: "手动尺寸" }] as const;

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

export const IMAGE_QUALITY_OPTIONS = [{ value: "low", label: "Low", description: "速度优先，适合草图预览" }, { value: "medium", label: "Medium", description: "平衡质量与速度，适合日常生成" }, { value: "high", label: "High", description: "高质量输出，适合最终出图" }] as const;
