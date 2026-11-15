import type { VideoGenerationRequest } from "@/lib/video-task-api";

export const videoDurations: VideoGenerationRequest["seconds"][] = [6, 10, 15];

export const videoSizes: Array<{
  value: VideoGenerationRequest["size"];
  label: string;
  ratio: string;
  shapeClass: string;
  frameClass: string;
}> = [
  { value: "720x1280", label: "竖屏", ratio: "9:16", shapeClass: "h-5 w-3", frameClass: "aspect-[9/16] max-h-[620px]" },
  { value: "1280x720", label: "横屏", ratio: "16:9", shapeClass: "h-3 w-5", frameClass: "aspect-video max-w-[780px]" },
  { value: "1024x1024", label: "方形", ratio: "1:1", shapeClass: "size-4", frameClass: "aspect-square max-h-[590px]" },
];

export const videoResolutions: Array<{ value: VideoGenerationRequest["resolution_name"]; label: string; detail: string }> = [
  { value: "480p", label: "480p", detail: "更快生成" },
  { value: "720p", label: "720p", detail: "画面更清晰" },
];

export const videoPresets: Array<{ value: VideoGenerationRequest["preset"]; label: string }> = [
  { value: "custom", label: "自定义" },
  { value: "normal", label: "标准" },
  { value: "fun", label: "趣味" },
  { value: "spicy", label: "强动态" },
];

export function selectedVideoSize(size: VideoGenerationRequest["size"]) {
  return videoSizes.find((item) => item.value === size) || videoSizes[0];
}
