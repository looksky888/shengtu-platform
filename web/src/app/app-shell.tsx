import { useLocation } from "react-router-dom";

import { AnimatedRoutes } from "@/app/animated-routes";
import { AdminConsoleSidebar } from "@/components/admin-console-sidebar";
import { TopNav } from "@/components/top-nav";
import { isAdminConsolePath } from "@/components/top-nav-config";
import { cn } from "@/lib/utils";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isConsoleRoute = isAdminConsolePath(pathname);
  const isStudioRoute = pathname === "/image" || pathname === "/video";

  return (
    <main className="flex min-h-screen min-w-0 flex-col bg-background text-foreground">
      <TopNav />
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 max-w-[1440px] flex-1",
          isConsoleRoute
            ? "items-start gap-4 px-3 py-3 sm:px-5 lg:px-6"
            : isStudioRoute
              ? "flex-col px-2.5 py-2 sm:px-4 lg:px-5"
              : "flex-col px-3 py-3 sm:px-5 lg:px-6"
        )}
      >
        <AdminConsoleSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AnimatedRoutes />
        </div>
      </div>
    </main>
  );
}
