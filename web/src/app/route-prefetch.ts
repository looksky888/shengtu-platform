type RouteLoader = () => Promise<unknown>;

const routeLoaders: Record<string, RouteLoader> = {
  "/": () => import("@/app/page"),
  "/login": () => import("@/app/login/page"),
  "/image": () => import("@/app/image/page"),
  "/video": () => import("@/app/video/page"),
  "/video-library": () => import("@/app/video-library/page"),
  "/image-manager": () => import("@/app/image-manager/page"),
  "/recharge": () => import("@/app/recharge/page"),
  "/profile": () => import("@/app/profile/page"),
  "/overview": () => import("@/app/admin/overview/page"),
  "/task-queue": () => import("@/app/task-queue/page"),
  "/accounts": () => import("@/app/accounts/page"),
  "/icloud": () => import("@/app/icloud/page"),
  "/users": () => import("@/app/users/page"),
  "/credits-admin": () => import("@/app/credits-admin/page"),
  "/payment-admin": () => import("@/app/payment-admin/page"),
  "/rbac": () => import("@/app/rbac/page"),
  "/logs": () => import("@/app/logs/page"),
  "/settings": () => import("@/app/settings/page"),
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
