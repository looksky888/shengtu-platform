import {
  Bot,
  Coins,
  CreditCard,
  Film,
  FolderKanban,
  Images,
  ListTodo,
  Mail,
  Palette,
  ScrollText,
  Server,
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
  { id: "operations", label: "号池与任务" },
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
    description: "文生视频、首帧参考与镜头扩展",
    keywords: ["video", "film", "shipin", "视频"],
  },
  {
    href: "/video-library",
    label: "视频库",
    accessPath: "/video",
    group: "assets",
    description: "浏览、播放与管理已生成视频资产",
    keywords: ["video", "library", "gallery", "视频库"],
  },
  {
    href: "/accounts",
    label: "号池管理",
    group: "operations",
    description: "GPT 与 Grok 账号池配额与测活",
    keywords: ["account", "pool", "gpt", "grok", "号池", "账号"],
  },
  {
    href: "/task-queue",
    label: "任务中心",
    group: "operations",
    description: "实时队列、Worker 并发与隔离仓",
    keywords: ["task", "queue", "jobs", "任务", "队列"],
  },
  {
    href: "/icloud",
    label: "iCloud 邮箱",
    group: "operations",
    description: "隐私邮箱池、收件取码与隔离恢复",
    keywords: ["icloud", "mail", "email", "邮箱", "接码"],
  },
  {
    href: "/register",
    label: "自动注册",
    group: "operations",
    description: "自动化批量注册、过盾与结果导出",
    keywords: ["register", "bot", "signup", "注册", "注册机"],
  },
  {
    href: "/logs",
    label: "系统日志",
    group: "operations",
    description: "全链路请求审计、级别筛选与排障",
    keywords: ["logs", "console", "debug", "日志"],
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
    href: "/users",
    label: "用户管理",
    group: "business",
    description: "平台用户检索、状态管控与角色分配",
    keywords: ["users", "member", "用户"],
  },
  {
    href: "/rbac",
    label: "角色权限",
    group: "business",
    description: "角色矩阵、页面路由与 API 细粒度授权",
    keywords: ["rbac", "role", "permission", "权限", "角色"],
  },
  {
    href: "/credits-admin",
    label: "积分与卡密",
    group: "business",
    description: "积分余额调账、兑换卡密与流水审计",
    keywords: ["credits", "balance", "ledger", "积分", "卡密"],
  },
  {
    href: "/payment-admin",
    label: "支付配置",
    group: "business",
    description: "充值套餐、支付网关通道与订单对账",
    keywords: ["payment", "orders", "gateway", "支付", "订单"],
  },
  {
    href: "/settings",
    label: "系统设置",
    group: "system",
    description: "运行参数、生图路由、存储备份与升级",
    keywords: ["settings", "config", "system", "设置", "配置"],
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
      (item) => item.external || primaryNavPaths.has(item.href)
    ),
    overflow: items.filter(
      (item) => !item.external && !primaryNavPaths.has(item.href)
    ),
  };
}

export function consolidatePrimaryNavItems(
  items: NavItem[],
  pathname: string
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

export const ADMIN_CONSOLE_PATHS = new Set([
  "/accounts",
  "/task-queue",
  "/icloud",
  "/register",
  "/logs",
  "/users",
  "/credits-admin",
  "/payment-admin",
  "/rbac",
  "/settings",
]);

export function isAdminConsolePath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const prefix of ADMIN_CONSOLE_PATHS) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
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
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (isActivePath(pathname, item.href)) {
    return true;
  }
  return Boolean(
    item.matchPaths?.some((candidate) => isActivePath(pathname, candidate))
  );
}

const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
  "/image": Palette,
  "/video": Video,
  "/video-library": Film,
  "/image-manager": Images,
  "/task-queue": ListTodo,
  "/accounts": Server,
  "/icloud": Mail,
  "/register": Bot,
  "/logs": ScrollText,
  "/recharge": WalletCards,
  "/users": Users,
  "/credits-admin": Coins,
  "/payment-admin": CreditCard,
  "/rbac": ShieldCheck,
  "/settings": Settings,
  "/profile": UserCircle2,
};

export function getNavItemIcon(item: NavItem): LucideIcon {
  if (item.external) {
    return Sparkles;
  }
  return ROUTE_ICON_MAP[item.href] ?? FolderKanban;
}
