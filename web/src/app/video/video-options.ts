import type { CSSProperties } from "react";
import type { VideoGenerationRequest } from "@/lib/video-task-api";

export const videoDurations: Array<{
  value: VideoGenerationRequest["seconds"];
  label: string;
  detail: string;
}> = [
  { value: 6, label: "6s", detail: "紧凑镜头 · 快速出片" },
  { value: 10, label: "10s", detail: "标准叙事 · 动作完整" },
  { value: 15, label: "15s", detail: "长镜调度 · 空间延展" },
];

export const videoModels: Array<{
  value: VideoGenerationRequest["model"];
  label: string;
  shortLabel: string;
  badge: string;
  detail: string;
}> = [
  {
    value: "grok-imagine-video-1.5",
    label: "Grok Video 1.5",
    shortLabel: "Video 1.5",
    badge: "推荐",
    detail: "Console 引擎 · 支持最多 7 张多图角色一致性与精细运镜",
  },
  {
    value: "grok-imagine-video",
    label: "Grok Video 1.0",
    shortLabel: "Video 1.0",
    badge: "经典",
    detail: "Web 引擎 · 标准文生与首帧图生视频",
  },
];

export const videoSizes: Array<{
  value: VideoGenerationRequest["size"];
  label: string;
  ratio: string;
  shapeClass: string;
  frameClass: string;
  stageMaxClass: string;
}> = [
  {
    value: "1280x720",
    label: "横屏电影",
    ratio: "16:9",
    shapeClass: "h-2.5 w-4",
    frameClass: "aspect-video",
    stageMaxClass: "max-w-[780px]",
  },
  {
    value: "720x1280",
    label: "竖屏短片",
    ratio: "9:16",
    shapeClass: "h-4 w-2.5",
    frameClass: "aspect-[9/16]",
    stageMaxClass: "max-w-[330px]",
  },
  {
    value: "1024x1024",
    label: "方形构图",
    ratio: "1:1",
    shapeClass: "size-3",
    frameClass: "aspect-square",
    stageMaxClass: "max-w-[490px]",
  },
  {
    value: "1792x1024",
    label: "宽银幕",
    ratio: "3:2",
    shapeClass: "h-2.5 w-3.5",
    frameClass: "aspect-[3/2]",
    stageMaxClass: "max-w-[720px]",
  },
  {
    value: "1024x1792",
    label: "竖画幅",
    ratio: "2:3",
    shapeClass: "h-3.5 w-2.5",
    frameClass: "aspect-[2/3]",
    stageMaxClass: "max-w-[370px]",
  },
];

export const videoResolutions: Array<{
  value: VideoGenerationRequest["resolution_name"];
  label: string;
  detail: string;
}> = [
  { value: "720p", label: "720P", detail: "高清画质" },
  { value: "480p", label: "480P", detail: "极速预览" },
];

export const videoPresets: Array<{
  value: VideoGenerationRequest["preset"];
  label: string;
  detail: string;
}> = [
  { value: "custom", label: "自定义", detail: "忠实遵循提示词运镜" },
  { value: "normal", label: "标准", detail: "自然平衡的画面动态" },
  { value: "fun", label: "趣味", detail: "富有戏剧张力与节奏" },
  { value: "spicy", label: "强动态", detail: "大幅度镜头与主体运动" },
];

export const cameraMotionPresets: ReadonlyArray<{
  label: string;
  tag: string;
  descriptor: string;
}> = [
  {
    label: "电影推轨特写",
    tag: "Dolly In",
    descriptor: "缓慢推轨镜头特写，细腻光学浅景深与胶片颗粒质感",
  },
  {
    label: "航拍环绕纵深",
    tag: "Orbit",
    descriptor: "平稳无人机环绕航拍运镜，展现宏大空间纵深与自然丁达尔体积光",
  },
  {
    label: "35mm 手持跟拍",
    tag: "Tracking",
    descriptor: "35mm 电影镜头低机位跟拍，真实呼吸感运动节奏与自然动态模糊",
  },
  {
    label: "高速微距升格",
    tag: "Slow-Mo",
    descriptor: "高速摄影慢动作微距捕捉，清晰呈现流体飞溅与材质高光细节",
  },
  {
    label: "希区柯克变焦",
    tag: "Dolly Zoom",
    descriptor: "滑动变焦镜头，主体比例保持稳定而背景空间产生强烈透视压缩",
  },
  {
    label: "固定机位光影延时",
    tag: "Timelapse",
    descriptor: "三脚架固定机位构图，云层与建筑光影随时间平滑流动切换",
  },
];

export type VideoInspirationCard = {
  id: string;
  category: string;
  title: string;
  size: VideoGenerationRequest["size"];
  ratio: string;
  seconds: VideoGenerationRequest["seconds"];
  prompt: string;
};

export const videoInspirationPrompts: ReadonlyArray<VideoInspirationCard> = [
  {
    id: "cyber-rain-chase",
    category: "电影叙事 · 推轨",
    title: "雨夜霓虹街巷低机位跟拍",
    size: "1280x720",
    ratio: "16:9",
    seconds: 10,
    prompt:
      "潮湿雨夜的未来东亚街巷，霓虹招牌在积水路面折射出冷暖交织的倒影；身穿深色风衣的主角快步穿过蒸汽弥漫的路口，35mm 变形宽银幕镜头低机位平滑跟拍，雨滴划过镜头边缘，电影级暗部层次。",
  },
  {
    id: "luxury-macro-fluid",
    category: "商业广告 · 微距",
    title: "琥珀色丝绸流体与玻璃器皿",
    size: "720x1280",
    ratio: "9:16",
    seconds: 6,
    prompt:
      "极简摄影棚柔光环境下，晶莹剔透的几何切割香水瓶置于黑色湿润玄武岩上，琥珀色丝绸质感流体在半空中缓慢环绕飞溅，高速微距升格镜头缓慢推进，高光折射细腻清透。",
  },
  {
    id: "iceland-aerial-coast",
    category: "自然风光 · 航拍",
    title: "冰岛黑沙滩晨雾航拍长镜头",
    size: "1792x1024",
    ratio: "3:2",
    seconds: 15,
    prompt:
      "破晓时分的冰岛黑沙滩，白色海浪呈扇形冲刷黑色火山砂岸，远处雪山笼罩在淡金色晨雾与丁达尔光束中；无人机高空俯视缓慢向前推进并轻柔俯仰，史诗感电影色调。",
  },
  {
    id: "film-portrait-breeze",
    category: "胶片人像 · 特写",
    title: "午后窗边微风胶片人像",
    size: "1024x1792",
    ratio: "2:3",
    seconds: 6,
    prompt:
      "温暖午后阳光透过百叶窗洒在亚麻窗帘上，微风轻拂年轻女子的发丝，光斑在脸颊与眼眸间柔和游走；Kodak 500T 胶片色彩，85mm 大光圈浅景深缓慢呼吸感推镜。",
  },
];

export function selectedVideoSize(size: VideoGenerationRequest["size"]) {
  return videoSizes.find((item) => item.value === size) || videoSizes[0];
}

export function selectedVideoModel(model: VideoGenerationRequest["model"]) {
  return videoModels.find((item) => item.value === model) || videoModels[0];
}

export function selectedVideoPreset(preset: VideoGenerationRequest["preset"]) {
  return videoPresets.find((item) => item.value === preset) || videoPresets[0];
}

/**
 * Computes proportional preview box dimensions (in px) inside a 16x16 icon container,
 * inspired by ddcat-ai/open-ai-canvas `ratioPreviewStyle`.
 */
export function ratioPreviewStyle(ratio: string, maxSide = 14): CSSProperties {
  const [rawW, rawH] = ratio.split(":").map((part) => Number(part));
  const w = Number.isFinite(rawW) && rawW > 0 ? rawW : 16;
  const h = Number.isFinite(rawH) && rawH > 0 ? rawH : 9;
  if (w >= h) {
    return {
      width: `${maxSide}px`,
      height: `${Math.max(7, Math.round((maxSide * h) / w))}px`,
    };
  }
  return {
    width: `${Math.max(7, Math.round((maxSide * w) / h))}px`,
    height: `${maxSide}px`,
  };
}

export function formatVideoShotTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
