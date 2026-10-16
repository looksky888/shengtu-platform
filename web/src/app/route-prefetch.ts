type RouteLoader = () => Promise<unknown>;

const routeLoaders: Record<string, RouteLoader> = {
  "/accounts": () => import("@/app/accounts/page"),
  "/icloud": () => import("@/app/icloud/page"),
  "/register": () => import("@/app/register/page"),
  "/image-manager": () => import("@/app/image-manager/page"),
  "/users": () => import("@/app/users/page"),
  "/credits-admin": () => import("@/app/credits-admin/page"),
  "/payment-admin": () => import("@/app/payment-admin/page"),
  "/recharge": () => import("@/app/recharge/page"),
  "/profile": () => import("@/app/profile/page"),
  "/rbac": () => import("@/app/rbac/page"),
  "/logs": () => import("@/app/logs/page"),
  "/image-task-logs": () => import("@/app/image-task-logs/page"),
  "/task-queue": () => import("@/app/task-queue/page"),
  "/settings": () => import("@/app/settings/page"),
  "/image": () => import("@/app/image/page"),
  "/video": () => import("@/app/video/page"),
  "/video-library": () => import("@/app/video-library/page"),
};

const pending = new Map<string, Promise<unknown>>();

/** Start loading a route chunk before the user clicks its navigation item. */
export function preloadRoute(path: string) {
  const loader = routeLoaders[path];
  if (!loader || pending.has(path)) return;
  const promise = loader().catch(() => undefined).finally(() => {
    pending.delete(path);
  });
  pending.set(path, promise);
}
