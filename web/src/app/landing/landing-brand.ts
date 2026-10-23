import { DEFAULT_APP_TITLE } from "@/lib/app-meta";

export function normalizeBrandTitle(rawTitle?: string): string {
  const trimmed = String(rawTitle || "").trim();
  if (!trimmed) return DEFAULT_APP_TITLE;
  if (trimmed === "chatgpt2api" || trimmed === "ChatGPT" || trimmed.toLowerCase() === "chatgpt2api") {
    return "Shengtu Studio";
  }
  return trimmed;
}

export type CuratedArtwork = {
  id: string;
  plate: string;
  src: string;
  title: string;
  subtitle: string;
  aspectTag: string;
  renderSpec: string;
  prompt: string;
};

export const CURATED_GALLERY_ARTWORKS: readonly CuratedArtwork[] = [
  {
    id: "editorial-fashion",
    plate: "PL.01",
    src: "/presets/editorial-fashion.webp",
    title: "东方高定暗调人像",
    subtitle: "35mm 胶片质感 · 江南雨夜",
    aspectTag: "16:10 EDITORIAL",
    renderSpec: "35MM FILM · 2.1s",
    prompt: "江南雨夜青石拱桥，东方高定丝绒暗黑礼服，暖色灯笼柔和散景，35mm 胶片颗粒与暗房影调",
  },
  {
    id: "stellar-poster",
    plate: "PL.02",
    src: "/presets/stellar-poster.webp",
    title: "暗曜石拱门与星穹",
    subtitle: "典藏级海报排版 · 建筑纪念碑",
    aspectTag: "2:3 PORTRAIT",
    renderSpec: "PRINT MAT · 2.4s",
    prompt: "极简暗曜石拱门伫立静谧镜面水域，深邃银河星穹与薄雾阶梯，美术馆典藏展览海报版式",
  },
  {
    id: "qinghua-museum",
    plate: "PL.03",
    src: "/presets/qinghua-museum-infographic.webp",
    title: "明代青花折枝莲纹瓶",
    subtitle: "博物馆典藏级微距摄影",
    aspectTag: "RAW 4K",
    renderSpec: "85MM MACRO · 1.9s",
    prompt: "博物馆柔和漫射布光，明代青花折枝花卉纹玉壶春瓶，开片釉面细节，真丝衬垫与手工宣纸展签",
  },
  {
    id: "forza-shenzhen",
    plate: "PL.04",
    src: "/presets/forza-horizon-shenzhen.webp",
    title: "滨海雨夜超跑工业摄影",
    subtitle: "动态追焦 · 建筑光影反射",
    aspectTag: "16:10 CINEMA",
    renderSpec: "ANAMORPHIC · 2.6s",
    prompt: "深圳湾雨夜跨海大桥，银色超跑低机位高速动态追焦，潮湿沥青路面霓虹尾灯反射与城市天际线",
  },
];

export const STUDIO_CAPABILITY_SPECS = [
  {
    index: "01",
    code: "ULTRA HD",
    label: "4K 典藏画质",
    detail: "细腻光学景深与暗房影调还原",
  },
  {
    index: "02",
    code: "INPAINT",
    label: "局部蒙版重绘",
    detail: "画笔涂抹定向精修构图与材质",
  },
  {
    index: "03",
    code: "MOTION",
    label: "多轨视频生成",
    detail: "首尾帧锚定与电影感镜头推演",
  },
  {
    index: "04",
    code: "GATEWAY",
    label: "OpenAI 兼容 API",
    detail: "多模型号池调度与云端资产归档",
  },
] as const;

export const LANDING_BRAND = {
  defaultName: DEFAULT_APP_TITLE,
  versionPill: "STUDIO v4.8",
  eyebrow: "MULTIMODAL AI STUDIO · 影像与视频创作工作台",
  headlinePrefix: "让每一次灵感，定格为",
  headlineRotatingPhrases: ["典藏级视觉作品", "电影感镜头叙事", "暗房级光影构图"] as const,
  description:
    "集文生图创作、图生图局部重绘、多镜头视频生成与云端资产归档于一体的数字视觉工作台。多模型渠道原生调度，以克制纯粹的纸墨界面专注每一次灵感成片。",
  footerLeft: "SHENGTU STUDIO · GALLERY PAPER & OBSIDIAN INK",
  footerRight: "TEXT-TO-IMAGE · INPAINTING · MULTI-SHOT VIDEO · CLOUD ARCHIVE",
};
