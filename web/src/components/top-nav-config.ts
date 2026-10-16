import type { Transition } from "motion/react";

export type NavItem = { href: string; label: string; accessPath?: string; external?: boolean };

export const navItems: NavItem[] = [
  { href: "/image", label: "图片创作" },
  { href: "/video", label: "视频创作" },
  { href: "/video-library", label: "视频库", accessPath: "/video" },
  { href: "/task-queue", label: "任务中心" },
  { href: "/accounts", label: "号池管理" },
  { href: "/icloud", label: "iCloud 邮箱" },
  { href: "/register", label: "注册机" },
  { href: "/image-manager", label: "图片库" },
  { href: "/recharge", label: "充值中心" },
  { href: "/users", label: "用户管理" },
  { href: "/credits-admin", label: "积分管理" },
  { href: "/payment-admin", label: "支付管理" },
  { href: "/rbac", label: "角色权限" },
  { href: "/settings", label: "设置" },
];

const primaryNavPaths = new Set(["/image", "/video", "/video-library", "/image-manager", "/recharge"]);

export function partitionNavItems(items: NavItem[]) {
  return {
    primary: items.filter((item) => item.external || primaryNavPaths.has(item.href)),
    overflow: items.filter((item) => !item.external && !primaryNavPaths.has(item.href)),
  };
}

export const profileNavItem: NavItem = { href: "/profile", label: "个人中心" };
export const PRIMARY_NAV_ID = "primary-navigation";
export const NAV_ACTIVE_LAYOUT_ID = "top-nav-active-pill";
export const navActiveTransition: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };
export const reducedNavActiveTransition: Transition = { duration: 0.01 };

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
