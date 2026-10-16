import { AnimatedRoutes } from "@/app/animated-routes";
import { TopNav } from "@/components/top-nav";

export function AppShell() {
  return (
    <main className="min-h-screen min-w-0 bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[1440px] flex-col gap-2 px-3 py-3 sm:px-5 lg:px-6">
        <TopNav />
        <AnimatedRoutes />
      </div>
    </main>
  );
}
