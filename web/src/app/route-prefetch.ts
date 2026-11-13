type RouteLoader = () => Promise<unknown>;

const routeLoaders: Record<string, RouteLoader> = {
  "/": () => import("@/app/page"),
  "/login": () => import("@/app/login/page"),
  "/image": () => import("@/app/image/page"),
  "/video": () => import("@/app/video/page"),
  "/tasks": () => import("@/app/tasks/page"),
  "/assets": () => import("@/app/assets/page"),
  "/wallet": () => import("@/app/wallet/page"),
  "/profile": () => import("@/app/profile/page"),
  "/image-manager": () => import("@/app/assets/page"),
  "/video-library": () => import("@/app/assets/page"),
  "/recharge": () => import("@/app/wallet/page"),
  "/admin": () => import("@/app/admin/overview/page"),
  "/admin/channels": () => import("@/app/admin/channels/page"),
  "/admin/accounts": () => import("@/app/admin/accounts/page"),
  "/admin/clearance": () => import("@/app/admin/clearance/page"),
  "/admin/users": () => import("@/app/admin/users/page"),
  "/admin/announcements": () => import("@/app/admin/announcements/page"),
  "/admin/payments": () => import("@/app/admin/payments/page"),
  "/admin/credits": () => import("@/app/admin/credits/page"),
  "/admin/logs": () => import("@/app/admin/logs/page"),
  "/admin/settings/appearance": () => import("@/app/admin/settings/appearance/page"),
  "/admin/settings/access": () => import("@/app/admin/settings/access/page"),
  "/admin/settings/storage": () => import("@/app/admin/settings/storage/page"),
  "/admin/settings/system": () => import("@/app/admin/settings/system/page"),
};

const pending = new Map<string, Promise<unknown>>();

/** Start loading a route chunk before the user clicks its navigation item. */
export function preloadRoute(path: string) {
  const cleanPath = path.split("?")[0] || path;
  const loader = routeLoaders[cleanPath];
  if (!loader || pending.has(cleanPath)) return;
  const promise = loader()
    .catch(() => undefined)
    .finally(() => {
      pending.delete(cleanPath);
    });
  pending.set(cleanPath, promise);
}
