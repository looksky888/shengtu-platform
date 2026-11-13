import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { AnimatedRoutes } from "@/app/animated-routes";
import { isAdminRoutePath } from "@/components/admin/admin-navigation";
import { resolveRoutePageTitle } from "@/components/top-nav-config";
import { normalizeBrandTitle } from "@/lib/app-meta";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { useAppMeta } from "@/lib/use-app-meta";

const LazyWorkspaceShell = lazyWithRetry(() =>
  import("@/components/workspace/workspace-shell").then((mod) => ({
    default: mod.WorkspaceShell,
  })),
);

const LazyAdminShell = lazyWithRetry(() =>
  import("@/components/admin/admin-shell").then((mod) => ({
    default: mod.AdminShell,
  })),
);

export function AppShell() {
  const location = useLocation();
  const appMeta = useAppMeta();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isPublicRoute = pathname === "/" || pathname === "/login";
  const isAdminRoute = isAdminRoutePath(pathname);

  useEffect(() => {
    if (isPublicRoute) return;
    const brandTitle = normalizeBrandTitle(appMeta.app_title);
    const pageTitle = resolveRoutePageTitle(pathname);
    document.title = pageTitle ? `${pageTitle} · ${brandTitle}` : brandTitle;
  }, [appMeta.app_title, isPublicRoute, pathname]);

  if (isAdminRoute) {
    return (
      <Suspense
        fallback={
          <div
            data-admin-root=""
            className="flex h-dvh w-full items-center justify-center bg-[var(--admin-canvas,#0f0f0f)] text-xs text-[var(--admin-text-muted,#8a8a8a)]"
          >
            正在进入管理控制台…
          </div>
        }
      >
        <LazyAdminShell>
          <AnimatedRoutes />
        </LazyAdminShell>
      </Suspense>
    );
  }

  if (isPublicRoute) {
    return (
      <main className="flex min-h-screen min-w-0 flex-col bg-background text-foreground">
        <div className="flex w-full min-w-0 flex-1 flex-col">
          <AnimatedRoutes />
        </div>
      </main>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-dvh w-full items-center justify-center bg-background text-xs text-muted-foreground">
          正在加载创作工作台…
        </div>
      }
    >
      <LazyWorkspaceShell>
        <AnimatedRoutes />
      </LazyWorkspaceShell>
    </Suspense>
  );
}
