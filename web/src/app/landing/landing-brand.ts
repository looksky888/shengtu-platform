import { Layers, Sparkles, Zap } from "lucide-react";

import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME } from "@/lib/app-meta";

/** Pre-login Hero brand — aligned with defaultAppMeta / TopNav. */
export const LANDING_BRAND = {
  name: DEFAULT_APP_TITLE,
  left: "SHENGTU",
  right: "STUDIO",
  badge: DEFAULT_PROJECT_NAME,
  headline: "多模型生图与视频创作工作台",
  tagline: "GPT 与 Grok 渠道一体接入，极速稳定的企业级创作空间。",
  footer: "Secure · Multi-channel · Self-hosted",
  channels: [
    { label: "GPT 号池", icon: Layers },
    { label: "Grok 渠道", icon: Zap },
    { label: "登录即用", icon: Sparkles },
  ],
};
