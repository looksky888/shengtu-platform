import { DEFAULT_APP_TITLE, DEFAULT_PROJECT_NAME } from "@/lib/app-meta";

/** Crisp slate & studio blue palette shared with the pre-login Hero and workbench. */
export const loginBackgroundClass =
  "bg-[#f8fafc] bg-[radial-gradient(rgba(20,86,240,0.08)_1px,transparent_1px),linear-gradient(145deg,#eff6ff_0%,#f8fafc_48%,#f1f5f9_100%)] [background-position:0_0,center] [background-size:16px_16px,cover] dark:bg-[#090b10] dark:bg-[radial-gradient(rgba(96,165,250,0.1)_1px,transparent_1px),linear-gradient(145deg,#090b10_0%,#0f172a_52%,#090b10_100%)]";

export const loginCardClass =
  "relative z-10 grid w-full max-w-[58rem] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.12),0_8px_24px_-8px_rgba(20,86,240,0.06)] backdrop-blur transition-[min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-white/10 dark:bg-[#10131a]/95 dark:shadow-[0_30px_90px_rgba(0,0,0,0.55)] lg:min-h-[38rem] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]";

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
