import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME } from "@/lib/app-meta";

/** Gallery Paper (#fafafa) & Obsidian Ink (#09090b) studio backdrop with 32px hairline grid. */
export const loginBackgroundClass = "bg-background studio-grid-bg text-foreground";

export const loginCardClass =
  "relative z-10 grid w-full max-w-[64rem] overflow-hidden rounded-2xl border border-border/90 bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.03)] transition-[min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-white/[0.09] dark:bg-[#111113] dark:shadow-[0_28px_80px_rgba(0,0,0,0.68)] lg:min-h-[41rem] lg:grid-cols-[1.08fr_0.92fr]";

export type LoginAppMeta = {
  app_title?: string;
  project_name?: string;
  login_page_image_url?: string;
  login_page_image_mode?: string;
  login_page_image_zoom?: number;
  login_page_image_position_x?: number;
  login_page_image_position_y?: number;
};

export function normalizeBrandTitle(rawTitle?: string): string {
  const trimmed = String(rawTitle || "").trim();
  if (!trimmed) return DEFAULT_APP_TITLE;
  if (trimmed === "chatgpt2api" || trimmed === "ChatGPT" || trimmed.toLowerCase() === "chatgpt2api") {
    return "Shengtu Studio";
  }
  return trimmed;
}

export function appTitle(meta: LoginAppMeta): string {
  return normalizeBrandTitle(meta.app_title);
}

export function projectName(meta: LoginAppMeta): string {
  const title = appTitle(meta);
  const raw = String(meta.project_name || "").trim();
  if (
    !raw ||
    raw === title ||
    raw === "chatgpt2api" ||
    raw === "ChatGPT" ||
    raw.toLowerCase() === "chatgpt2api"
  ) {
    return DEFAULT_PROJECT_NAME;
  }
  return raw;
}
