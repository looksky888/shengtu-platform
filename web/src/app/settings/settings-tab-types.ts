export const SETTINGS_TABS = [
  { key: "base", label: "基础与品牌" },
  { key: "image", label: "生图与路由" },
  { key: "email", label: "邮箱与注册" },
  { key: "register", label: "代理与清障" },
  { key: "imports", label: "账号导入" },
  { key: "storage", label: "媒体存储" },
  { key: "announcement", label: "站内公告" },
  { key: "backup", label: "数据备份" },
  { key: "maintenance", label: "维护与日志" },
  { key: "system-update", label: "系统更新" },
] as const;

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export type SettingsDomainId = "core" | "access" | "content" | "ops";

export type SettingsDomainGroup = {
  id: SettingsDomainId;
  label: string;
  tabs: readonly SettingsTabKey[];
};

export const SETTINGS_DOMAIN_GROUPS: readonly SettingsDomainGroup[] = [
  {
    id: "core",
    label: "核心与生图",
    tabs: ["base", "image"],
  },
  {
    id: "access",
    label: "账号与风控",
    tabs: ["email", "register", "imports"],
  },
  {
    id: "content",
    label: "存储与公告",
    tabs: ["storage", "announcement"],
  },
  {
    id: "ops",
    label: "备份与运维",
    tabs: ["backup", "maintenance", "system-update"],
  },
] as const;

export function parseSettingsTab(value: string | null): SettingsTabKey {
  return SETTINGS_TABS.some((tab) => tab.key === value)
    ? (value as SettingsTabKey)
    : "base";
}

export function getSettingsDomainForTab(tab: SettingsTabKey): SettingsDomainId {
  const found = SETTINGS_DOMAIN_GROUPS.find((group) =>
    group.tabs.includes(tab)
  );
  return found?.id ?? "core";
}
