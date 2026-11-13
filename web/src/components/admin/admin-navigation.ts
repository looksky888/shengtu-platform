import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Coins,
  CreditCard,
  Database,
  FileClock,
  KeyRound,
  MailCheck,
  Megaphone,
  Network,
  Palette,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { StoredAuthSession } from "@/store/auth-types";

export type AdminNavGroupId = "overview" | "compute" | "commerce" | "settings";

export type AdminNavItem = {
  href: string;
  label: string;
  group: AdminNavGroupId;
  groupLabel: string;
  description: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type AdminNavGroup = {
  id: AdminNavGroupId;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: ReadonlyArray<{
  id: AdminNavGroupId;
  label: string;
}> = [
  { id: "overview", label: "概览" },
  { id: "compute", label: "算力与号池" },
  { id: "commerce", label: "商业与运营" },
  { id: "settings", label: "系统配置" },
];

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "数据概览",
    group: "overview",
    groupLabel: "概览",
    description: "全局核心指标、生成趋势曲线、模型分析与号池健康度",
    icon: BarChart3,
    exact: true,
  },
  {
    href: "/admin/channels",
    label: "系统渠道",
    group: "compute",
    groupLabel: "算力与号池",
    description: "管理生图与视频渠道、上游路由及分档模型积分定价",
    icon: Network,
  },
  {
    href: "/admin/accounts",
    label: "账号池中心",
    group: "compute",
    groupLabel: "算力与号池",
    description: "ChatGPT / Grok 号池管理、iCloud 隐私邮箱与 CPA 远程导入",
    icon: KeyRound,
  },
  {
    href: "/admin/clearance",
    label: "过盾与代理",
    group: "compute",
    groupLabel: "算力与号池",
    description: "出站代理链路、FlareSolverr 自动过盾与实时连通诊断",
    icon: ShieldCheck,
  },
  {
    href: "/admin/users",
    label: "用户与权限",
    group: "commerce",
    groupLabel: "商业与运营",
    description: "注册用户资料检索、额度调账与 RBAC 角色权限矩阵",
    icon: Users,
  },
  {
    href: "/admin/announcements",
    label: "通知与公告",
    group: "commerce",
    groupLabel: "商业与运营",
    description: "系统实时弹窗广播与顶部 4 色常驻滚动通知横幅",
    icon: Megaphone,
  },
  {
    href: "/admin/payments",
    label: "支付与套餐",
    group: "commerce",
    groupLabel: "商业与运营",
    description: "算力与云存储 VIP 套餐、订单对账及支付网关通道",
    icon: CreditCard,
  },
  {
    href: "/admin/credits",
    label: "积分与卡密",
    group: "commerce",
    groupLabel: "商业与运营",
    description: "积分兑换码批次制卡、人工调账与全站积分流水",
    icon: Coins,
  },
  {
    href: "/admin/logs",
    label: "请求与审计",
    group: "commerce",
    groupLabel: "商业与运营",
    description: "实时生成队列、隔离账号取码恢复与系统请求审计日志",
    icon: FileClock,
  },
  {
    href: "/admin/settings/appearance",
    label: "站点与外观",
    group: "settings",
    groupLabel: "系统配置",
    description: "站点基础运行参数、无限画布导航入口与登录页画廊海报",
    icon: Palette,
  },
  {
    href: "/admin/settings/access",
    label: "注册与邮件",
    group: "settings",
    groupLabel: "系统配置",
    description: "开放注册开关、防刷风控规则、SMTP 邮件与实时封禁名单",
    icon: MailCheck,
  },
  {
    href: "/admin/settings/storage",
    label: "存储与备份",
    group: "settings",
    groupLabel: "系统配置",
    description: "云存储付费会员制总开关、R2 媒体存储迁移与 SQLite 热备",
    icon: Database,
  },
  {
    href: "/admin/settings/system",
    label: "系统维护与更新",
    group: "settings",
    groupLabel: "系统配置",
    description: "Worker 并发配额、审计日志滚动治理与在线版本平滑更新",
    icon: Activity,
  },
];

export function isAdminRoutePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/admin" || normalized.startsWith("/admin/");
}

export function isAdminNavItemActive(pathname: string, item: AdminNavItem): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (item.exact) {
    return normalized === item.href;
  }
  return normalized === item.href || normalized.startsWith(`${item.href}/`);
}

export function getAccessibleAdminNavGroups(
  session: StoredAuthSession | null | undefined,
  checkAccess: (
    session: StoredAuthSession | null | undefined,
    path: string,
  ) => boolean,
): AdminNavGroup[] {
  const visible = ADMIN_NAV_ITEMS.filter((item) => checkAccess(session, item.href));
  return ADMIN_NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: visible.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);
}

export function findCurrentAdminNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(pathname, item));
}

export function resolveLegacySettingsRedirect(search: string): string {
  const params = new URLSearchParams(search);
  const tab = (params.get("tab") || "").trim().toLowerCase();
  switch (tab) {
    case "image":
      return "/admin/channels";
    case "email":
      return "/admin/settings/access?tab=email";
    case "register":
      return "/admin/clearance";
    case "imports":
      return "/admin/accounts?tab=cpa";
    case "storage":
      return "/admin/settings/storage?tab=media";
    case "announcement":
      return "/admin/announcements";
    case "backup":
      return "/admin/settings/storage?tab=backup";
    case "maintenance":
      return "/admin/settings/system?tab=governance";
    case "system-update":
      return "/admin/settings/system?tab=update";
    case "base":
    default:
      return "/admin/settings/appearance";
  }
}
