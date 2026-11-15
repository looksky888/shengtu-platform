import type { StoredAuthSession } from "@/store/auth-types";

const API_PERMISSION_SUBTREE_ROOTS: ReadonlyArray<{ method: string; path: string }> = [
  { method: "get", path: "/api/creation-tasks" },
  { method: "post", path: "/api/creation-tasks" },
  { method: "get", path: "/api/videos" },
  { method: "get", path: "/api/video-reference-assets" },
  { method: "post", path: "/api/video-reference-assets" },
  { method: "delete", path: "/api/video-reference-assets" },
  { method: "get", path: "/v1/videos" },
  { method: "post", path: "/v1/videos" },
  { method: "delete", path: "/v1/videos" },
  { method: "get", path: "/api/auth/users" },
  { method: "post", path: "/api/auth/users" },
  { method: "delete", path: "/api/auth/users" },
  { method: "get", path: "/api/grok" },
  { method: "post", path: "/api/grok" },
  { method: "delete", path: "/api/grok" },
  { method: "get", path: "/api/icloud" },
  { method: "post", path: "/api/icloud" },
  { method: "delete", path: "/api/icloud" },
  { method: "post", path: "/api/admin/image-task-logs" },
  { method: "get", path: "/api/admin/image-task-stats" },
  { method: "get", path: "/api/admin/credits" },
  { method: "post", path: "/api/admin/credits" },
  { method: "get", path: "/api/admin/email-settings" },
  { method: "put", path: "/api/admin/email-settings" },
  { method: "post", path: "/api/admin/email-settings" },
  { method: "get", path: "/api/admin/image-channels" },
  { method: "post", path: "/api/admin/image-channels" },
  { method: "put", path: "/api/admin/image-channels" },
  { method: "patch", path: "/api/admin/image-channels" },
  { method: "delete", path: "/api/admin/image-channels" },
  { method: "get", path: "/api/admin/payment-settings" },
  { method: "put", path: "/api/admin/payment-settings" },
  { method: "post", path: "/api/admin/payment-settings" },
  { method: "patch", path: "/api/admin/payment-settings" },
  { method: "get", path: "/api/admin/payments/settings" },
  { method: "put", path: "/api/admin/payments/settings" },
  { method: "post", path: "/api/admin/payments/settings" },
  { method: "patch", path: "/api/admin/payments/settings" },
  { method: "get", path: "/api/admin/payment-channels" },
  { method: "post", path: "/api/admin/payment-channels" },
  { method: "put", path: "/api/admin/payment-channels" },
  { method: "patch", path: "/api/admin/payment-channels" },
  { method: "delete", path: "/api/admin/payment-channels" },
  { method: "get", path: "/api/admin/recharge-products" },
  { method: "post", path: "/api/admin/recharge-products" },
  { method: "put", path: "/api/admin/recharge-products" },
  { method: "patch", path: "/api/admin/recharge-products" },
  { method: "delete", path: "/api/admin/recharge-products" },
  { method: "get", path: "/api/admin/payment-orders" },
  { method: "post", path: "/api/admin/payment-orders" },
  { method: "get", path: "/api/admin/payment-reconciliations" },
  { method: "post", path: "/api/admin/payment-reconciliations" },
  { method: "get", path: "/api/payment/orders" },
  { method: "post", path: "/api/payment/orders" },
  { method: "get", path: "/api/admin/registration-risk-settings" },
  { method: "put", path: "/api/admin/registration-risk-settings" },
  { method: "post", path: "/api/admin/registration-risk-settings" },
  { method: "delete", path: "/api/admin/registration-risk-settings" },
  { method: "get", path: "/api/proxy" },
  { method: "post", path: "/api/proxy" },
  { method: "get", path: "/api/admin/system" },
  { method: "post", path: "/api/admin/system" },
  { method: "get", path: "/api/admin/backup" },
  { method: "post", path: "/api/admin/backup" },
  { method: "get", path: "/api/admin/media-storage" },
  { method: "post", path: "/api/admin/media-storage" },
  { method: "put", path: "/api/admin/media-storage" },
  { method: "delete", path: "/api/admin/media-storage" },
  { method: "get", path: "/api/admin/announcements" },
  { method: "post", path: "/api/admin/announcements" },
  { method: "delete", path: "/api/admin/announcements" },
  { method: "get", path: "/api/cpa/pools" },
  { method: "post", path: "/api/cpa/pools" },
  { method: "delete", path: "/api/cpa/pools" },
  { method: "get", path: "/api/admin/users" },
  { method: "post", path: "/api/admin/users" },
  { method: "delete", path: "/api/admin/users" },
  { method: "get", path: "/api/admin/roles" },
  { method: "post", path: "/api/admin/roles" },
  { method: "delete", path: "/api/admin/roles" },
];

export const OVERVIEW_ELIGIBLE_PATHS = [
  "/overview",
  "/admin",
  "/settings",
] as const;

const SETTINGS_EQUIVALENT_PATHS = [
  "/settings",
  "/admin/settings",
  "/admin/settings/appearance",
  "/admin/settings/access",
  "/admin/settings/storage",
  "/admin/settings/system",
  "/admin/channels",
  "/admin/clearance",
  "/admin/announcements",
] as const;

export const ADMIN_ROUTE_LEGACY_EQUIVALENTS: Record<string, readonly string[]> = {
  "/overview": OVERVIEW_ELIGIBLE_PATHS,
  "/admin": OVERVIEW_ELIGIBLE_PATHS,
  "/admin/channels": ["/admin/channels", "/settings"],
  "/admin/accounts": ["/admin/accounts", "/accounts", "/icloud", "/settings"],
  "/admin/clearance": ["/admin/clearance", "/settings"],
  "/admin/users": ["/admin/users", "/users", "/rbac"],
  "/admin/announcements": ["/admin/announcements", "/settings"],
  "/admin/payments": ["/admin/payments", "/payment-admin"],
  "/admin/credits": ["/admin/credits", "/credits-admin"],
  "/admin/logs": ["/admin/logs", "/logs", "/task-queue", "/image-task-logs"],
  "/admin/settings": [
    "/admin/settings",
    "/admin/settings/appearance",
    "/admin/settings/access",
    "/admin/settings/storage",
    "/admin/settings/system",
    "/settings",
  ],
  "/admin/settings/appearance": ["/admin/settings/appearance", "/admin/settings", "/settings"],
  "/admin/settings/access": ["/admin/settings/access", "/admin/settings", "/settings"],
  "/admin/settings/storage": ["/admin/settings/storage", "/admin/settings", "/settings"],
  "/admin/settings/system": ["/admin/settings/system", "/admin/settings", "/settings"],
  "/settings": SETTINGS_EQUIVALENT_PATHS,
  "/accounts": ["/accounts", "/admin/accounts"],
  "/users": ["/users", "/admin/users"],
  "/credits-admin": ["/credits-admin", "/admin/credits"],
  "/payment-admin": ["/payment-admin", "/admin/payments"],
  "/logs": ["/logs", "/admin/logs"],
  "/task-queue": ["/task-queue", "/image-task-logs"],
};

const V6_BOOKMARK_TO_CLASSIC_ROUTE: Record<string, string> = {
  "/assets": "/image-manager",
  "/wallet": "/recharge",
  "/tasks": "/task-queue",
  "/image-task-logs": "/task-queue",
  "/admin": "/overview",
  "/admin/channels": "/settings",
  "/admin/clearance": "/settings",
  "/admin/announcements": "/settings",
  "/admin/settings": "/settings",
  "/admin/settings/appearance": "/settings",
  "/admin/settings/access": "/settings",
  "/admin/settings/storage": "/settings",
  "/admin/settings/system": "/settings",
  "/admin/accounts": "/accounts",
  "/admin/users": "/users",
  "/admin/credits": "/credits-admin",
  "/admin/payments": "/payment-admin",
  "/admin/logs": "/logs",
};

function cleanRoutePath(path: string): string {
  const withoutQuery = String(path || "").split("?")[0]?.trim() || "";
  if (!withoutQuery) return "/";
  const withSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withSlash !== "/" ? withSlash.replace(/\/+$/, "") : "/";
}

function hasBroadOverviewPermission(menuPaths: readonly string[]): boolean {
  if (
    OVERVIEW_ELIGIBLE_PATHS.some((candidate) => menuPaths.includes(candidate)) ||
    SETTINGS_EQUIVALENT_PATHS.some((candidate) => menuPaths.includes(candidate))
  ) {
    return true;
  }
  const hasUsers =
    menuPaths.includes("/users") || menuPaths.includes("/admin/users");
  const hasAccounts =
    menuPaths.includes("/accounts") || menuPaths.includes("/admin/accounts");
  return hasUsers && hasAccounts;
}

export function canAccessPath(session: StoredAuthSession | null | undefined, path: string) {
  if (!session) return false;
  const cleanPath = cleanRoutePath(path);
  if (cleanPath === "/profile" || session.role === "admin") {
    return true;
  }
  const menuPaths = Array.isArray(session.menuPaths) ? session.menuPaths : [];
  if (cleanPath === "/overview" || cleanPath === "/admin") {
    return hasBroadOverviewPermission(menuPaths);
  }
  if (cleanPath === "/tasks") {
    return (
      menuPaths.includes("/tasks") ||
      menuPaths.includes("/task-queue") ||
      menuPaths.includes("/image") ||
      menuPaths.includes("/video")
    );
  }
  if (cleanPath === "/assets") {
    return (
      menuPaths.includes("/assets") ||
      menuPaths.includes("/image-manager") ||
      menuPaths.includes("/video-library") ||
      menuPaths.includes("/image") ||
      menuPaths.includes("/video")
    );
  }
  if (cleanPath === "/video-library") {
    return menuPaths.includes("/video-library") || menuPaths.includes("/video");
  }
  if (cleanPath === "/image-manager") {
    return (
      menuPaths.includes("/image-manager") ||
      menuPaths.includes("/image") ||
      menuPaths.includes("/assets")
    );
  }
  if (cleanPath === "/recharge" || cleanPath === "/wallet") {
    return menuPaths.includes("/recharge") || menuPaths.includes("/wallet");
  }
  const adminEquivalents = ADMIN_ROUTE_LEGACY_EQUIVALENTS[cleanPath];
  if (adminEquivalents) {
    return adminEquivalents.some((candidate) => menuPaths.includes(candidate));
  }
  return menuPaths.includes(cleanPath);
}

function normalizeAPIPermissionPath(path: string): string {
  const trimmed = String(path || "").trim();
  if (!trimmed) return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash !== "/" ? withSlash.replace(/\/+$/, "") : withSlash;
}

function apiPermissionKey(method: string, path: string): string {
  return `${method.toLowerCase().trim()}${normalizeAPIPermissionPath(path)}`;
}

export function hasAPIPermission(session: StoredAuthSession | null | undefined, method: string, path: string) {
  if (!session) return false;
  if (session.role === "admin") return true;
  const normalizedMethod = method.toLowerCase().trim();
  const rawNormalizedPath = normalizeAPIPermissionPath(path);
  if (!normalizedMethod || !rawNormalizedPath) return false;
  const canonicalPath =
    rawNormalizedPath === "/api/admin/payments/settings"
      ? "/api/admin/payment-settings"
      : rawNormalizedPath === "/api/payment/config"
        ? "/api/payment/settings"
        : rawNormalizedPath;
  const candidatePaths =
    canonicalPath === rawNormalizedPath
      ? [rawNormalizedPath]
      : [rawNormalizedPath, canonicalPath];
  const allowed = Array.isArray(session.apiPermissions) ? session.apiPermissions : [];
  for (const candidatePath of candidatePaths) {
    if (allowed.includes(apiPermissionKey(normalizedMethod, candidatePath))) {
      return true;
    }
    if (
      API_PERMISSION_SUBTREE_ROOTS.some(
        (root) =>
          root.method === normalizedMethod &&
          (candidatePath === root.path || candidatePath.startsWith(`${root.path}/`)) &&
          allowed.includes(apiPermissionKey(root.method, root.path)),
      )
    ) {
      return true;
    }
  }
  return false;
}

const CLASSIC_DEFAULT_ROUTE_PRIORITY = [
  "/image",
  "/video",
  "/image-manager",
  "/recharge",
  "/overview",
  "/accounts",
  "/settings",
  "/video-library",
  "/task-queue",
  "/icloud",
  "/users",
  "/credits-admin",
  "/payment-admin",
  "/rbac",
  "/logs",
] as const;

export function getDefaultRouteForSession(session: StoredAuthSession) {
  const menuPaths = Array.isArray(session.menuPaths) ? session.menuPaths : [];
  for (const path of [
    ...CLASSIC_DEFAULT_ROUTE_PRIORITY,
    ...menuPaths,
    "/profile",
  ]) {
    const clean = cleanRoutePath(path);
    const mapped = V6_BOOKMARK_TO_CLASSIC_ROUTE[clean] || clean;
    if (canAccessPath(session, mapped)) {
      return mapped;
    }
  }
  return "/profile";
}
