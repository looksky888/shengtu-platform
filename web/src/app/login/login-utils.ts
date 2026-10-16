import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME } from "@/lib/app-meta";

/** Warm amber palette shared with the pre-login Hero. */
export const loginBackgroundClass =
  "bg-[#fff8f0] bg-[radial-gradient(rgba(217,119,6,0.1)_1px,transparent_1px),linear-gradient(145deg,#fff7ed_0%,#fff8f0_48%,#ffedd5_100%)] [background-position:0_0,center] [background-size:14px_14px,cover] dark:bg-[#0c0a09] dark:bg-[radial-gradient(rgba(251,191,36,0.12)_1px,transparent_1px),linear-gradient(145deg,#0c0a09_0%,#1c1410_52%,#0a0908_100%)]";

export const loginCardClass =
  "relative z-10 grid w-full max-w-[58rem] overflow-hidden rounded-[28px] border border-amber-100/90 bg-white/95 shadow-[0_28px_80px_rgba(120,53,15,0.1),0_10px_28px_rgba(180,83,9,0.06)] backdrop-blur transition-[min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:rounded-[32px] dark:border-amber-900/40 dark:bg-[#1c1410]/94 dark:shadow-[0_30px_90px_rgba(0,0,0,0.55),0_12px_32px_rgba(120,53,15,0.2)] lg:min-h-[39rem] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]";

export type LoginAppMeta = {
  app_title?: string;
  project_name?: string;
  login_page_image_url?: string;
  login_page_image_mode?: string;
  login_page_image_zoom?: number;
  login_page_image_position_x?: number;
  login_page_image_position_y?: number;
};

export function appTitle(meta: LoginAppMeta) {
  return meta.app_title || DEFAULT_APP_TITLE;
}

export function projectName(meta: LoginAppMeta) {
  return meta.project_name && meta.project_name !== meta.app_title ? meta.project_name : DEFAULT_PROJECT_NAME;
}
