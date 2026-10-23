import type { VideoGenerationRequest } from "@/lib/video-task-api";

export const videoDurations: VideoGenerationRequest["seconds"][] = [6, 10, 15];

export const videoSizes: Array<{
  value: VideoGenerationRequest["size"];
  label: string;
  ratio: string;
  shapeClass: string;
  frameClass: string;
}> = [
  { value: "1280x720", label: "横屏", ratio: "16:9", shapeClass: "h-2.5 w-4", frameClass: "aspect-video max-w-[780px]" },
  { value: "720x1280", label: "竖屏", ratio: "9:16", shapeClass: "h-4 w-2.5", frameClass: "aspect-[9/16] max-h-[620px]" },
  { value: "1024x1024", label: "方形", ratio: "1:1", shapeClass: "size-3", frameClass: "aspect-square max-h-[590px]" },
  { value: "1792x1024", label: "宽画幅", ratio: "3:2", shapeClass: "h-2.5 w-3.5", frameClass: "aspect-[3/2] max-w-[740px]" },
  { value: "1024x1792", label: "竖画幅", ratio: "2:3", shapeClass: "h-3.5 w-2.5", frameClass: "aspect-[2/3] max-h-[620px]" },
];

export const videoResolutions: Array<{ value: VideoGenerationRequest["resolution_name"]; label: string; detail: string }> = [
  { value: "480p", label: "480P", detail: "极速预览" },
  { value: "720p", label: "720P", detail: "高清画质" },
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
