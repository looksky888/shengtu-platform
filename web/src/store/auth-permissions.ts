import type { StoredAuthSession } from "@/store/auth-types";

const API_PERMISSION_SUBTREE_ROOTS: ReadonlyArray<{ method: string; path: string }> = [
  { method: "get", path: "/api/creation-tasks" }, { method: "post", path: "/api/creation-tasks" },
  { method: "get", path: "/api/videos" }, { method: "get", path: "/api/auth/users" },
  { method: "post", path: "/api/auth/users" }, { method: "delete", path: "/api/auth/users" },
  { method: "get", path: "/api/register" }, { method: "post", path: "/api/register" },
  { method: "get", path: "/api/grok" }, { method: "post", path: "/api/grok" },
  { method: "delete", path: "/api/grok" }, { method: "get", path: "/api/icloud" },
  { method: "post", path: "/api/icloud" }, { method: "delete", path: "/api/icloud" },
  { method: "post", path: "/api/admin/image-task-logs" }, { method: "get", path: "/api/admin/image-task-stats" },
  { method: "get", path: "/api/admin/credits" }, { method: "post", path: "/api/admin/credits" },
  { method: "get", path: "/api/proxy" }, { method: "post", path: "/api/proxy" },
  { method: "get", path: "/api/admin/system" }, { method: "post", path: "/api/admin/system" },
  { method: "get", path: "/api/admin/backup" }, { method: "post", path: "/api/admin/backup" },
  { method: "get", path: "/api/admin/announcements" }, { method: "post", path: "/api/admin/announcements" },
  { method: "delete", path: "/api/admin/announcements" }, { method: "get", path: "/api/cpa/pools" },
  { method: "post", path: "/api/cpa/pools" }, { method: "delete", path: "/api/cpa/pools" },
  { method: "get", path: "/api/admin/users" }, { method: "post", path: "/api/admin/users" },
  { method: "delete", path: "/api/admin/users" }, { method: "get", path: "/api/admin/roles" },
  { method: "post", path: "/api/admin/roles" }, { method: "delete", path: "/api/admin/roles" },
];

export function canAccessPath(session: StoredAuthSession | null | undefined, path: string) {
  if (!session) return false;
  if (path === "/profile" || session.role === "admin") return true;
  if (path === "/video-library") {
    return Array.isArray(session.menuPaths) && (session.menuPaths.includes("/video-library") || session.menuPaths.includes("/video"));
  }
  return Array.isArray(session.menuPaths) && session.menuPaths.includes(path);
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
  const normalizedPath = normalizeAPIPermissionPath(path);
  if (!normalizedMethod || !normalizedPath) return false;
  const allowed = Array.isArray(session.apiPermissions) ? session.apiPermissions : [];
  if (allowed.includes(apiPermissionKey(normalizedMethod, normalizedPath))) return true;
  return API_PERMISSION_SUBTREE_ROOTS.some((root) =>
    root.method === normalizedMethod &&
    (normalizedPath === root.path || normalizedPath.startsWith(`${root.path}/`)) &&
    allowed.includes(apiPermissionKey(root.method, root.path)),
  );
}

export function getDefaultRouteForSession(session: StoredAuthSession) {
  if (session.role === "admin") return "/accounts";
  const menuPaths = Array.isArray(session.menuPaths) ? session.menuPaths : [];
  for (const path of ["/image", "/image-manager", "/settings", ...menuPaths, "/profile"]) {
    if (canAccessPath(session, path)) return path;
  }
  return "/image";
}
