import type { Announcement } from "@/lib/api";

import type {
  AnnouncementForm,
  AnnouncementStatusMeta,
} from "./announcements-types";

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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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

function readOptionalDateField(
  item: Announcement,
  keys: readonly string[]
): string | null {
  const record = item as unknown as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

export function getAnnouncementStatusMeta(
  item: Announcement,
  nowMs = Date.now()
): AnnouncementStatusMeta {
  if (!item.enabled) {
    return { key: "disabled", label: "已停用", variant: "secondary" };
  }
  const startsRaw = readOptionalDateField(item, [
    "starts_at",
    "start_at",
    "publish_at",
  ]);
  if (startsRaw) {
    const startsMs = new Date(startsRaw).getTime();
    if (!Number.isNaN(startsMs) && startsMs > nowMs) {
      return { key: "scheduled", label: "定时待发", variant: "warning" };
    }
  }
  const endsRaw = readOptionalDateField(item, [
    "ends_at",
    "end_at",
    "expires_at",
  ]);
  if (endsRaw) {
    const endsMs = new Date(endsRaw).getTime();
    if (!Number.isNaN(endsMs) && endsMs < nowMs) {
      return { key: "expired", label: "已过期", variant: "outline" };
    }
  }
  return { key: "active", label: "展示中", variant: "success" };
}

export function getAnnouncementTypeLabel(item: Announcement): string {
  return item.image_url?.trim() ? "图文公告" : "纯文本公告";
}

export function getAnnouncementDisplayModeLabel(item: Announcement): string {
  if (item.show_login && item.show_image) return "登录页 + 创作台弹窗";
  if (item.show_login) return "登录页弹窗";
  if (item.show_image) return "创作台弹窗";
  return "未指定触达页";
}

export function formatAnnouncementScheduleRange(item: Announcement): string {
  const startsRaw = readOptionalDateField(item, [
    "starts_at",
    "start_at",
    "publish_at",
  ]);
  const endsRaw = readOptionalDateField(item, [
    "ends_at",
    "end_at",
    "expires_at",
  ]);
  if (startsRaw || endsRaw) {
    const left = startsRaw ? formatAnnouncementDateTime(startsRaw) : "即时生效";
    const right = endsRaw ? formatAnnouncementDateTime(endsRaw) : "长期有效";
    return `${left} → ${right}`;
  }
  return `长期有效 · 更新于 ${formatAnnouncementDateTime(
    item.updated_at || item.created_at
  )}`;
}

export function buildDraftPreviewAnnouncement(
  form: AnnouncementForm,
  editingItem?: Announcement | null
): Announcement {
  const nowIso = new Date().toISOString();
  return {
    id: editingItem?.id ?? "__draft_preview__",
    title: form.title.trim() || "公告预览",
    content: form.content.trim() || "（暂无正文内容）",
    image_url: form.image_url.trim() || undefined,
    enabled: form.enabled,
    show_login: form.show_login,
    show_image: form.show_image,
    created_at: editingItem?.created_at ?? nowIso,
    updated_at: nowIso,
  };
}
