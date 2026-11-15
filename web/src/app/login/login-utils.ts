import { DEFAULT_PROJECT_NAME, normalizeBrandTitle } from "@/lib/app-meta";

export { normalizeBrandTitle };

/** Classic 4.3 light-first glass login backdrop & rounded-[32px] two-column card. */
export const loginBackgroundClass =
  "bg-[#f6f8fc] bg-[radial-gradient(rgba(20,86,240,0.07)_1px,transparent_1px),linear-gradient(145deg,#f8fbff_0%,#f6f8fc_48%,#eef4fc_100%)] [background-position:0_0,center] [background-size:16px_16px,cover] dark:bg-[#0c0a09] dark:bg-[radial-gradient(rgba(251,191,36,0.12)_1px,transparent_1px),linear-gradient(145deg,#0c0a09_0%,#1c1410_52%,#0a0908_100%)]";

export const loginCardClass =
  "relative z-10 grid w-full max-w-[58rem] overflow-hidden rounded-[28px] border border-[#dfe7f1] bg-white/95 shadow-[0_28px_80px_rgba(24,40,72,0.1),0_10px_28px_rgba(20,86,240,0.06)] backdrop-blur transition-[min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:rounded-[32px] dark:border-amber-900/40 dark:bg-[#1c1410]/94 dark:shadow-[0_30px_90px_rgba(0,0,0,0.55),0_12px_32px_rgba(120,53,15,0.2)] lg:min-h-[39rem] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]";

export type LoginAppMeta = {
  app_title?: string;
  project_name?: string;
  login_page_image_url?: string;
  login_page_image_mode?: string;
  login_page_image_zoom?: number;
  login_page_image_position_x?: number;
  login_page_image_position_y?: number;
};

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
