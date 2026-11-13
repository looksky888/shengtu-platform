import {
  Activity,
  BarChart3,
  Coins,
  CreditCard,
  Database,
  FileClock,
  Film,
  FolderKanban,
  Images,
  KeyRound,
  MailCheck,
  Megaphone,
  Network,
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
  { id: "operations", label: "算力与号池" },
  { id: "business", label: "商业与运营" },
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
    description: "文生视频、首帧参考与镜头扩展",
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
    description: "购买算力积分或存储套餐扫码支付",
    keywords: ["recharge", "pay", "buy", "充值", "购买"],
  },
  {
    href: "/admin",
    label: "数据概览",
    accessPath: "/admin",
    group: "operations",
    description: "全局核心指标、生成趋势曲线与号池水位",
    keywords: ["admin", "overview", "dashboard", "概览", "统计", "控制台"],
  },
  {
    href: "/admin/channels",
    label: "系统渠道",
    accessPath: "/admin/channels",
    group: "operations",
    description: "生图与视频中转渠道、上游模型同步与分档定价",
    keywords: ["channel", "provider", "model", "渠道", "模型", "单价"],
  },
  {
    href: "/admin/accounts",
    label: "账号池中心",
    accessPath: "/admin/accounts",
    group: "operations",
    description: "GPT / Grok 号池、iCloud 隐私邮箱与 CPA 远程导入",
    keywords: ["account", "pool", "gpt", "grok", "icloud", "cpa", "号池", "账号", "邮箱"],
  },
  {
    href: "/admin/clearance",
    label: "过盾与代理",
    accessPath: "/admin/clearance",
    group: "operations",
    description: "出站代理链路与 FlareSolverr 自动过盾诊断",
    keywords: ["proxy", "clearance", "flaresolverr", "代理", "过盾", "清障"],
  },
  {
    href: "/admin/users",
    label: "用户与权限",
    accessPath: "/admin/users",
    group: "business",
    description: "平台用户检索、积分调账与 RBAC 角色权限矩阵",
    keywords: ["users", "rbac", "role", "permission", "用户", "角色", "权限"],
  },
  {
    href: "/admin/announcements",
    label: "通知与公告",
    accessPath: "/admin/announcements",
    group: "business",
    description: "系统实时弹窗广播与顶部 4 色常驻通知横幅",
    keywords: ["announcement", "banner", "notice", "公告", "横幅", "广播"],
  },
  {
    href: "/admin/payments",
    label: "支付与套餐",
    accessPath: "/admin/payments",
    group: "business",
    description: "算力与云存储 VIP 套餐、订单对账及支付网关",
    keywords: ["payment", "orders", "gateway", "vip", "支付", "套餐", "订单"],
  },
  {
    href: "/admin/credits",
    label: "积分与卡密",
    accessPath: "/admin/credits",
    group: "business",
    description: "兑换码批次制卡、人工调账与全站积分流水",
    keywords: ["credits", "balance", "ledger", "积分", "卡密"],
  },
  {
    href: "/admin/logs",
    label: "请求与审计",
    accessPath: "/admin/logs",
    group: "business",
    description: "实时生成队列、隔离恢复与系统请求审计日志",
    keywords: ["logs", "task", "queue", "audit", "日志", "任务", "审计"],
  },
  {
    href: "/admin/settings/appearance",
    label: "站点与外观",
    accessPath: "/admin/settings/appearance",
    group: "system",
    description: "站点基础运行参数、无限画布入口与登录页海报",
    keywords: ["settings", "appearance", "canvas", "login", "站点", "外观", "画布"],
  },
  {
    href: "/admin/settings/access",
    label: "注册与邮件",
    accessPath: "/admin/settings/access",
    group: "system",
    description: "开放注册开关、防刷风控、SMTP 邮件与封禁名单",
    keywords: ["access", "smtp", "email", "risk", "注册", "邮件", "风控"],
  },
  {
    href: "/admin/settings/storage",
    label: "存储与备份",
    accessPath: "/admin/settings/storage",
    group: "system",
    description: "云存储 VIP 总开关、R2 媒体存储与 SQLite 热备",
    keywords: ["storage", "r2", "backup", "vip", "存储", "备份"],
  },
  {
    href: "/admin/settings/system",
    label: "系统维护与更新",
    accessPath: "/admin/settings/system",
    group: "system",
    description: "并发配额、审计日志治理与在线版本平滑更新",
    keywords: ["system", "update", "governance", "维护", "升级", "更新"],
  },
];

const primaryNavPaths = new Set([
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

export function consolidatePrimaryNavItems(
  items: NavItem[],
  pathname: string,
): NavItem[] {
  const hasImageManager = items.some((item) => item.href === "/image-manager");
  const hasVideoLibrary = items.some((item) => item.href === "/video-library");
  if (!hasImageManager && !hasVideoLibrary) {
    return items;
  }
  const mediaHref =
    pathname.startsWith("/video-library") && hasVideoLibrary
      ? "/video-library"
      : hasImageManager
        ? "/image-manager"
        : "/video-library";
  const result: NavItem[] = [];
  let mediaInserted = false;
  for (const item of items) {
    if (item.href === "/video-library" || item.href === "/image-manager") {
      if (!mediaInserted) {
        mediaInserted = true;
        result.push({
          href: mediaHref,
          label: "素材中心",
          group: "assets",
          description: "统一浏览与管理生成的图片与视频资产",
          keywords: [
            "media",
            "assets",
            "gallery",
            "image",
            "video",
            "素材中心",
            "图片库",
            "视频库",
          ],
          matchPaths: ["/image-manager", "/video-library"],
        });
      }
      continue;
    }
    result.push(item);
  }
  return result;
}

export const ADMIN_CONSOLE_PATHS = new Set(["/admin"]);

export function isAdminConsolePath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return clean === "/admin" || clean.startsWith("/admin/");
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
  "/tasks": FileClock,
  "/assets": Images,
  "/wallet": WalletCards,
  "/video-library": Film,
  "/image-manager": Images,
  "/recharge": WalletCards,
  "/admin": BarChart3,
  "/admin/channels": Network,
  "/admin/accounts": KeyRound,
  "/admin/clearance": ShieldCheck,
  "/admin/users": Users,
  "/admin/announcements": Megaphone,
  "/admin/payments": CreditCard,
  "/admin/credits": Coins,
  "/admin/logs": FileClock,
  "/admin/settings/appearance": Settings,
  "/admin/settings/access": MailCheck,
  "/admin/settings/storage": Database,
  "/admin/settings/system": Activity,
  "/profile": UserCircle2,
};

export function getNavItemIcon(item: NavItem): LucideIcon {
  if (item.external) {
    return Sparkles;
  }
  return ROUTE_ICON_MAP[item.href] ?? FolderKanban;
}

const WORKSPACE_PAGE_TITLES: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/tasks", label: "任务中心" },
  { href: "/assets", label: "素材云库" },
  { href: "/wallet", label: "积分与权益中心" },
];

export function resolveRoutePageTitle(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "/login") {
    return null;
  }
  if (isActivePath(clean, profileNavItem.href)) {
    return profileNavItem.label;
  }
  const workspaceMatched = WORKSPACE_PAGE_TITLES.find((item) =>
    isActivePath(clean, item.href),
  );
  if (workspaceMatched) {
    return workspaceMatched.label;
  }
  const matched = [...navItems]
    .filter((item) => !item.external)
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(clean, item.href));
  return matched?.label ?? null;
}
