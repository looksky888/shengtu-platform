import type { Announcement } from "@/lib/api";

import type { AnnouncementForm } from "./announcements-types";

export const emptyAnnouncementForm: AnnouncementForm = {
  title: "",
  content: "",
  image_url: "",
  enabled: true,
  show_login: true,
  show_image: false,
};

export function formatAnnouncementDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formFromAnnouncement(item: Announcement): AnnouncementForm {
  return {
    title: item.title || "",
    content: item.content || "",
    image_url: item.image_url || "",
    enabled: Boolean(item.enabled),
    show_login: Boolean(item.show_login),
    show_image: Boolean(item.show_image),
  };
}