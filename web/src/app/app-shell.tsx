import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { AnimatedRoutes } from "@/app/animated-routes";
import { resolveRoutePageTitle } from "@/components/top-nav-config";
import { normalizeBrandTitle } from "@/lib/app-meta";
import { useAppMeta } from "@/lib/use-app-meta";

const BannerAnnouncementsBar = lazy(() =>
  import("@/components/banner-announcements-bar").then((m) => ({
    default: m.BannerAnnouncementsBar,
  })),
);

const TopNav = lazy(() =>
  import("@/components/top-nav").then((m) => ({
    default: m.TopNav,
  })),
);

export function AppShell() {
  const location = useLocation();
  const appMeta = useAppMeta();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isPublicRoute = pathname === "/" || pathname === "/login";

  useEffect(() => {
    if (isPublicRoute) return;
    const brandTitle = normalizeBrandTitle(appMeta.app_title);
    const pageTitle = resolveRoutePageTitle(pathname);
    document.title = pageTitle ? `${pageTitle} · ${brandTitle}` : brandTitle;
  }, [appMeta.app_title, isPublicRoute, pathname]);

  if (isPublicRoute) {
    return (
      <main className="min-h-screen min-w-0 bg-background text-foreground">
        <AnimatedRoutes />
      </main>
    );
  }

  return (
    <main className="min-h-screen min-w-0 bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[1440px] flex-col gap-2 px-3 py-3 sm:px-5 lg:px-6">
        <Suspense fallback={null}>
          <BannerAnnouncementsBar
            target="image"
            className="overflow-hidden rounded-2xl border border-black/10 shadow-2xs dark:border-white/10"
          />
          <TopNav />
        </Suspense>
        <AnimatedRoutes />
      </div>
    </main>
  );
}
