import type { LucideIcon } from "lucide-react";
import {
  Clock3,
  Images,
  Layers,
  Settings2,
  Sparkles,
  WalletCards,
} from "lucide-react";

import type { StoredAuthSession } from "@/store/auth-types";

export type WorkspaceNavItemId =
  | "create"
  | "canvas"
  | "tasks"
  | "assets"
  | "wallet"
  | "settings";

export type WorkspaceNavItem = {
  id: WorkspaceNavItemId;
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
  accessPath?: string;
  external?: boolean;
  mobile?: boolean;
  matchPaths?: readonly string[];
};

export function normalizeWorkspacePath(pathname: string): string {
  const withoutQuery = String(pathname || "").split("?")[0]?.trim() || "";
  if (!withoutQuery) return "/";
  const withSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withSlash !== "/" ? withSlash.replace(/\/+$/, "") : "/";
}

export function resolveWorkspaceCanvasUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 2048 || /[\\\s]/.test(text)) return "";
  try {
    const url = new URL(text);
    return /^https?:\/\//i.test(text) &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
      ? text
      : "";
  } catch {
    return "";
  }
}

export const WORKSPACE_BASE_ITEMS: readonly WorkspaceNavItem[] = [
  {
    id: "create",
    href: "/image",
    label: "创作",
    title: "多模态创作工作台",
    icon: Sparkles,
    accessPath: "/image",
    mobile: true,
    matchPaths: ["/image", "/video"],
  },
  {
    id: "tasks",
    href: "/tasks",
    label: "任务",
    title: "任务中心",
    icon: Clock3,
    accessPath: "/tasks",
    mobile: true,
    matchPaths: ["/tasks"],
  },
  {
    id: "assets",
    href: "/assets",
    label: "素材",
    title: "素材云库",
    icon: Images,
    accessPath: "/assets",
    mobile: true,
    matchPaths: ["/assets", "/image-manager", "/video-library"],
  },
  {
    id: "wallet",
    href: "/wallet",
    label: "积分",
    title: "积分与权益中心",
    icon: WalletCards,
    accessPath: "/wallet",
    mobile: true,
    matchPaths: ["/wallet", "/recharge"],
  },
  {
    id: "settings",
    href: "/profile",
    label: "设置",
    title: "个人设置与 API 密钥",
    icon: Settings2,
    accessPath: "/profile",
    mobile: true,
    matchPaths: ["/profile"],
  },
];

export function isWorkspacePathMatch(pathname: string, target: string): boolean {
  const clean = normalizeWorkspacePath(pathname);
  const cleanTarget = normalizeWorkspacePath(target);
  return clean === cleanTarget || clean.startsWith(`${cleanTarget}/`);
}

export function isWorkspaceNavItemActive(
  pathname: string,
  item: WorkspaceNavItem,
): boolean {
  if (item.external) return false;
  if (isWorkspacePathMatch(pathname, item.href)) return true;
  return Boolean(
    item.matchPaths?.some((candidate) => isWorkspacePathMatch(pathname, candidate)),
  );
}

export function isStudioWorkspaceRoute(pathname: string): boolean {
  const clean = normalizeWorkspacePath(pathname);
  return clean === "/image" || clean === "/video";
}

export function buildWorkspaceNavItems(options: {
  session: StoredAuthSession | null | undefined;
  checkAccess: (
    session: StoredAuthSession | null | undefined,
    path: string,
  ) => boolean;
  canvasUrl?: unknown;
}): WorkspaceNavItem[] {
  const { session, checkAccess, canvasUrl } = options;
  if (!session) return [];

  const canImage = checkAccess(session, "/image");
  const canVideo = checkAccess(session, "/video");
  const validCanvasUrl = resolveWorkspaceCanvasUrl(canvasUrl);

  const items: WorkspaceNavItem[] = [];
  for (const base of WORKSPACE_BASE_ITEMS) {
    if (base.id === "create") {
      if (canImage || canVideo) {
        items.push({
          ...base,
          href: canImage ? "/image" : "/video",
        });
      }
      if (validCanvasUrl && (canImage || canVideo)) {
        items.push({
          id: "canvas",
          href: validCanvasUrl,
          label: "无限画布",
          title: "无限画布（新标签页打开）",
          icon: Layers,
          accessPath: "/image",
          external: true,
          mobile: false,
        });
      }
      continue;
    }

    if (checkAccess(session, base.accessPath || base.href)) {
      items.push(base);
    }
  }

  return items;
}

export function getMobileWorkspaceNavItems(
  items: readonly WorkspaceNavItem[],
): WorkspaceNavItem[] {
  return items.filter((item) => !item.external && item.mobile !== false);
}

export function resolveLegacyImageManagerRedirect(search = ""): string {
  const params = new URLSearchParams(search);
  const next = new URLSearchParams();
  next.set("type", "image");
  const view = (params.get("view") || params.get("scope") || "").trim();
  if (view === "public" || view === "all") {
    next.set("view", view);
  }
  return `/assets?${next.toString()}`;
}

export function resolveLegacyVideoLibraryRedirect(search = ""): string {
  const params = new URLSearchParams(search);
  const next = new URLSearchParams();
  next.set("type", "video");
  const view = (params.get("view") || params.get("scope") || "").trim();
  if (view === "public" || view === "all") {
    next.set("view", view);
  }
  return `/assets?${next.toString()}`;
}
