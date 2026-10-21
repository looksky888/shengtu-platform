import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";

export function AppShell() {
  return (
    <main className="flex min-h-screen min-w-0 flex-col bg-background text-foreground">
      <TopNav />
      <div className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-1 flex-col px-3 py-3 sm:px-5 lg:px-6">
        <AnimatedRoutes />
      </div>
    </main>
  );
}
