import { Layers, Sparkles, Zap } from "lucide-react";

import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME, normalizeBrandTitle } from "@/lib/app-meta";

export { normalizeBrandTitle };

export const PENDING_STUDIO_PROMPT_STORAGE_KEY = "shengtu:pending-studio-prompt";

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
    subtitle: "35mm 胶片 · 江南雨夜",
    aspectTag: "16:10 EDITORIAL",
    renderSpec: "35MM FILM · 2.1s",
    prompt: "江南雨夜青石拱桥，东方高定丝绒暗黑礼服，暖色灯笼柔和散景，35mm 胶片颗粒与暗房影调",
  },
];

/** Pre-login Classic 4.3 Hero brand — aligned with TopNav & AppMeta. */
export const LANDING_BRAND = {
  name: DEFAULT_APP_TITLE,
  left: "CHAT",
  right: "GPT",
  badge: DEFAULT_PROJECT_NAME,
  headline: "多模型生图工作台",
  tagline: "GPT 与 Grok 渠道一体接入，登录后即用。",
  footer: "Secure · Multi-channel · Self-hosted",
  channels: [
    { label: "GPT 号池", icon: Layers },
    { label: "Grok 渠道", icon: Zap },
    { label: "登录即用", icon: Sparkles },
  ],
};
