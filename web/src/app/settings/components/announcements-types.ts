export type AnnouncementForm = {
  title: string;
  content: string;
  image_url: string;
  enabled: boolean;
  show_login: boolean;
  show_image: boolean;
  broadcast_now: boolean;
};

export type AnnouncementStatusKey =
  | "active"
  | "disabled"
  | "scheduled"
  | "expired";

export type AnnouncementStatusMeta = {
  key: AnnouncementStatusKey;
  label: "展示中" | "已停用" | "定时待发" | "已过期";
  variant: "success" | "secondary" | "warning" | "outline";
};
