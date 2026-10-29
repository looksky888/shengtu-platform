import { useLocation } from "react-router-dom";

import { AnimatedRoutes } from "@/app/animated-routes";
import { AdminConsoleSidebar } from "@/components/admin-console-sidebar";
import { TopNav } from "@/components/top-nav";
import { isAdminConsolePath } from "@/components/top-nav-config";
import { cn } from "@/lib/utils";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isPublicRoute = pathname === "/" || pathname === "/login";
  const isConsoleRoute = isAdminConsolePath(pathname);
  const isStudioRoute = pathname === "/image" || pathname === "/video";
  const isStageFramed = !isPublicRoute && !isStudioRoute;

  return (
    <main className="flex min-h-screen min-w-0 flex-col bg-background text-foreground">
      <TopNav />
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
        <AdminConsoleSidebar />
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
