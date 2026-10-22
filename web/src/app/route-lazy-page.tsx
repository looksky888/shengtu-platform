import { Suspense, type ComponentType } from "react";
import { LoaderCircle } from "lucide-react";

function RouteLoading() {
  return (
    <div
      className="flex min-h-[420px] w-full flex-col gap-4 py-2"
      role="status"
      aria-label="正在加载页面"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3.5 w-20 animate-pulse rounded-md bg-muted/70" />
          <div className="h-7 w-44 animate-pulse rounded-lg bg-muted/80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/80" />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-card/60 p-12 text-xs text-muted-foreground shadow-2xs">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        <span>正在加载工作区模块…</span>
      </div>
    </div>
  );
}

export function LazyPage({ Page }: { Page: ComponentType }) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Page />
    </Suspense>
  );
}
