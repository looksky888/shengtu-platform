import {
  BarChart3,
  Coins,
  CreditCard,
  FileClock,
  Film,
  FolderKanban,
  Images,
  KeyRound,
  ListTodo,
  MailCheck,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Users,
  Video,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { Transition } from "motion/react";

export type NavGroupId =
  | "creation"
  | "assets"
  | "operations"
  | "business"
  | "system";

export type NavItem = {
  href: string;
  label: string;
  accessPath?: string;
  external?: boolean;
  group?: NavGroupId;
  description?: string;
  keywords?: string[];
  matchPaths?: string[];
};

export type NavGroupMeta = {
  id: NavGroupId;
  label: string;
};

export const navGroups: NavGroupMeta[] = [
  { id: "creation", label: "创作工作台" },
  { id: "assets", label: "创作资产" },
  { id: "operations", label: "算力与运营" },
  { id: "business", label: "用户与商业" },
  { id: "system", label: "系统配置" },
];

export const navItems: NavItem[] = [
  {
    href: "/image",
    label: "图片创作",
    group: "creation",
    description: "多模态生图、局部重绘与对话画布",
    keywords: ["image", "draw", "paint", "shengtu", "生图", "画图"],
  },
  {
    href: "/video",
    label: "视频创作",
    group: "creation",
    description: "文生视频、首帧参考与镜头生成",
    keywords: ["video", "film", "shipin", "视频"],
  },
  {
    href: "/video-library",
    label: "视频库",
    accessPath: "/video-library",
    group: "assets",
    description: "浏览、播放与管理已生成视频资产",
    keywords: ["video", "library", "gallery", "视频库"],
  },
  {
    href: "/image-manager",
    label: "图片库",
    group: "assets",
    description: "个人与公开图片资产检索与归档",
    keywords: ["image", "gallery", "library", "图片库", "相册"],
  },
  {
    href: "/recharge",
    label: "充值中心",
    group: "business",
    description: "购买算力积分或云存储套餐扫码支付",
    keywords: ["recharge", "pay", "buy", "充值", "购买"],
  },
  {
    href: "/overview",
    label: "经营概览",
    accessPath: "/overview",
    group: "operations",
    description: "全局核心指标、生成趋势曲线与号池水位",
    keywords: ["overview", "admin", "dashboard", "经营概览", "数据概览", "统计"],
  },
  {
    href: "/task-queue",
    label: "任务中心",
    group: "operations",
    description: "实时生成队列、异常隔离恢复与任务历史",
    keywords: ["task", "queue", "任务中心", "队列"],
  },
  {
    href: "/accounts",
    label: "号池管理",
    group: "operations",
    description: "ChatGPT 与 Grok 号池账号监控与治理",
    keywords: ["accounts", "pool", "gpt", "grok", "号池", "账号"],
  },
  {
    href: "/icloud",
    label: "iCloud 邮箱",
    group: "operations",
    description: "iCloud 隐私中转邮箱池同步与维护",
    keywords: ["icloud", "mail", "邮箱"],
  },
  {
    href: "/users",
    label: "用户管理",
    group: "business",
    description: "平台用户检索、启停控制与角色分配",
    keywords: ["users", "用户管理", "账号"],
  },
  {
    href: "/credits-admin",
    label: "积分管理",
    group: "business",
    description: "兑换码制卡、人工调账与全站积分流水",
    keywords: ["credits", "balance", "ledger", "积分", "卡密"],
  },
  {
    href: "/payment-admin",
    label: "支付管理",
    group: "business",
    description: "算力与云存储套餐、订单对账及支付网关",
    keywords: ["payment", "orders", "gateway", "vip", "支付", "套餐", "订单"],
  },
  {
    href: "/rbac",
    label: "角色权限",
    group: "business",
    description: "自定义 RBAC 角色菜单与 API 权限矩阵",
    keywords: ["rbac", "role", "permission", "角色", "权限"],
  },
  {
    href: "/logs",
    label: "日志管理",
    group: "system",
    description: "系统请求审计日志检索、筛选与导出",
    keywords: ["logs", "audit", "日志", "审计"],
  },
  {
    href: "/settings",
    label: "设置",
    group: "system",
    description: "基础配置、生图渠道、过盾代理、R2 存储、公告与更新",
    keywords: ["settings", "config", "channel", "proxy", "r2", "设置", "配置"],
  },
];

export const primaryNavPaths = new Set([
  "/image",
  "/video",
  "/video-library",
  "/image-manager",
  "/recharge",
]);

export function partitionNavItems(items: NavItem[]) {
  return {
    primary: items.filter(
      (item) => item.external || primaryNavPaths.has(item.href),
    ),
    overflow: items.filter(
      (item) => !item.external && !primaryNavPaths.has(item.href),
    ),
  };
}

export function groupNavItems(items: NavItem[]) {
  return navGroups
    .map((group) => ({
      ...group,
      items: items.filter((item) => (item.group ?? "creation") === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

export const profileNavItem: NavItem = {
  href: "/profile",
  label: "个人中心",
  group: "business",
  description: "查看个人账户信息、修改密码与积分明细",
};

export const PRIMARY_NAV_ID = "primary-navigation";
export const NAV_ACTIVE_LAYOUT_ID = "top-nav-active-pill";
export const navActiveTransition: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.7,
};
export const reducedNavActiveTransition: Transition = { duration: 0.01 };

export function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (isActivePath(pathname, item.href)) {
    return true;
  }
  return Boolean(
    item.matchPaths?.some((candidate) => isActivePath(pathname, candidate)),
  );
}

const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
  "/image": Palette,
  "/video": Video,
  "/video-library": Film,
  "/image-manager": Images,
  "/recharge": WalletCards,
  "/overview": BarChart3,
  "/task-queue": ListTodo,
  "/accounts": KeyRound,
  "/icloud": MailCheck,
  "/users": Users,
  "/credits-admin": Coins,
  "/payment-admin": CreditCard,
  "/rbac": ShieldCheck,
  "/logs": FileClock,
  "/settings": Settings,
  "/profile": UserCircle2,
};

export function getNavItemIcon(item: NavItem): LucideIcon {
  if (item.external) {
    return Sparkles;
  }
  return ROUTE_ICON_MAP[item.href] ?? FolderKanban;
}

const LEGACY_PAGE_TITLES: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/admin/settings/storage", label: "媒体存储" },
  { href: "/admin/settings/system", label: "系统更新" },
  { href: "/admin/settings/access", label: "邮件与风控" },
  { href: "/admin/settings/appearance", label: "基础配置" },
  { href: "/admin/settings", label: "设置" },
  { href: "/admin/channels", label: "生图渠道" },
  { href: "/admin/clearance", label: "过盾与代理" },
  { href: "/admin/announcements", label: "通知公告" },
  { href: "/admin/accounts", label: "号池管理" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/credits", label: "积分管理" },
  { href: "/admin/payments", label: "支付管理" },
  { href: "/admin/logs", label: "日志管理" },
  { href: "/admin", label: "经营概览" },
  { href: "/assets", label: "图片库" },
  { href: "/wallet", label: "充值中心" },
  { href: "/tasks", label: "任务中心" },
  { href: "/image-task-logs", label: "任务中心" },
];

export function resolveRoutePageTitle(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "/login") {
    return null;
  }
  if (isActivePath(clean, profileNavItem.href)) {
    return profileNavItem.label;
  }
  const matched = [...navItems]
    .filter((item) => !item.external)
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(clean, item.href));
  if (matched) {
    return matched.label;
  }
  const legacyMatched = LEGACY_PAGE_TITLES.find((item) =>
    isActivePath(clean, item.href),
  );
  return legacyMatched?.label ?? null;
}
