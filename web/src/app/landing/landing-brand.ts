import { Layers, Sparkles, Zap } from "lucide-react";

import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME } from "@/lib/app-meta";

/** Pre-login Hero brand — aligned with defaultAppMeta / TopNav. */
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
