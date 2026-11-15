import type { Announcement, AnnouncementBannerTone } from "@/lib/api";

export type BannerToneOption = {
  value: AnnouncementBannerTone;
  label: string;
  shortLabel: string;
  desc: string;
  cssVar: string;
};

export const BANNER_TONES: ReadonlyArray<BannerToneOption> = [
  {
    value: "notice",
    label: "常规通知",
    shortLabel: "常规通知",
    desc: "靛蓝语义条 · 日常通知与规则提示",
    cssVar: "var(--banner-notice-bg)",
  },
  {
    value: "activity",
    label: "运营活动",
    shortLabel: "运营活动",
    desc: "洋红语义条 · 限时充值优惠与上新活动",
    cssVar: "var(--banner-activity-bg)",
  },
  {
    value: "update",
    label: "版本更新",
    shortLabel: "版本更新",
    desc: "青绿语义条 · 新模型上线与能力升级",
    cssVar: "var(--banner-update-bg)",
  },
  {
    value: "warning",
    label: "维护预警",
    shortLabel: "维护预警",
    desc: "琥珀语义条 · 渠道波动或停机维护提醒",
    cssVar: "var(--banner-warning-bg)",
  },
];

export function getBannerToneMeta(
  tone: AnnouncementBannerTone | undefined,
): BannerToneOption {
  return BANNER_TONES.find((item) => item.value === tone) ?? BANNER_TONES[0]!;
}

export type DrawerFormState = {
  title: string;
  content: string;
  image_url: string;
  enabled: boolean;
  show_login: boolean;
  show_image: boolean;
  broadcast_now: boolean;
  display_mode: "popup" | "banner";
  banner_tone: AnnouncementBannerTone;
  link_url: string;
};

export function createEmptyForm(mode: "popup" | "banner"): DrawerFormState {
  return {
    title: "",
    content: "",
    image_url: "",
    enabled: true,
    show_login: mode === "popup",
    show_image: true,
    broadcast_now: false,
    display_mode: mode,
    banner_tone: "notice",
    link_url: "",
  };
}

export function formFromItem(item: Announcement): DrawerFormState {
  return {
    title: item.title || "",
    content: item.content || "",
    image_url: item.image_url || "",
    enabled: Boolean(item.enabled),
    show_login: Boolean(item.show_login),
    show_image: Boolean(item.show_image),
    broadcast_now: false,
    display_mode: item.display_mode === "banner" ? "banner" : "popup",
    banner_tone: item.banner_tone || "notice",
    link_url: item.link_url || "",
  };
}
