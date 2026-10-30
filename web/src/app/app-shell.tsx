import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { AnimatedRoutes } from "@/app/animated-routes";
import { isAdminConsolePath, resolveRoutePageTitle } from "@/components/top-nav-config";
import { normalizeBrandTitle } from "@/lib/app-meta";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { useAppMeta } from "@/lib/use-app-meta";
import { cn } from "@/lib/utils";

const LazyTopNav = lazyWithRetry(() =>
  import("@/components/top-nav").then((mod) => ({ default: mod.TopNav })),
);

const LazyAdminConsoleSidebar = lazyWithRetry(() =>
  import("@/components/admin-console-sidebar").then((mod) => ({
    default: mod.AdminConsoleSidebar,
  })),
);

export function AppShell() {
  const location = useLocation();
  const appMeta = useAppMeta();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isPublicRoute = pathname === "/" || pathname === "/login";
  const isConsoleRoute = isAdminConsolePath(pathname);
  const isStudioRoute = pathname === "/image" || pathname === "/video";
  const isStageFramed = !isPublicRoute && !isStudioRoute;

  useEffect(() => {
    if (isPublicRoute) return;
    const brandTitle = normalizeBrandTitle(appMeta.app_title);
    const pageTitle = resolveRoutePageTitle(pathname);
    document.title = pageTitle ? `${pageTitle} · ${brandTitle}` : brandTitle;
  }, [appMeta.app_title, isPublicRoute, pathname]);

  return (
    <main className="flex min-h-screen min-w-0 flex-col bg-background text-foreground">
      {!isPublicRoute ? (
        <Suspense fallback={<div className="h-14 shrink-0 border-b border-border/60 bg-background/80" />}>
          <LazyTopNav />
        </Suspense>
      ) : null}
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 max-w-[1520px] flex-1",
          isPublicRoute
            ? "flex-col"
            : isConsoleRoute
              ? "flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-start lg:gap-3.5 lg:px-5"
              : isStudioRoute
                ? "flex-col px-2.5 py-2 sm:px-3.5 lg:px-4"
                : "flex-col px-3 py-3 sm:px-4 lg:px-5"
        )}
      >
        {isConsoleRoute ? (
          <Suspense fallback={null}>
            <LazyAdminConsoleSidebar />
          </Suspense>
        ) : null}
        <div
          className={cn(
            "flex w-full min-w-0 flex-1 flex-col",
            isStageFramed &&
              "studio-stage-frame rounded-2xl p-4 sm:p-5 lg:p-6"
          )}
        >
          <AnimatedRoutes />
        </div>
      </div>
    </main>
  );
}
