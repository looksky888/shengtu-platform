export const SETTINGS_TABS = [
  { key: "base", label: "基础设置" },
  { key: "email", label: "邮箱与注册" },
  { key: "register", label: "代理与 FlareSolverr" },
  { key: "image", label: "生图设置" },
  { key: "storage", label: "媒体存储" },
  { key: "imports", label: "账号导入" },
  { key: "announcement", label: "公告" },
  { key: "backup", label: "备份" },
  { key: "system-update", label: "系统更新" },
  { key: "maintenance", label: "维护与日志" },
] as const;

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export function parseSettingsTab(value: string | null): SettingsTabKey {
  return SETTINGS_TABS.some((tab) => tab.key === value)
    ? (value as SettingsTabKey)
    : "base";
}
