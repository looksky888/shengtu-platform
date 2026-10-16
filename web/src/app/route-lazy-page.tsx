import { Suspense, type ComponentType } from "react";

function RouteLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
      Loading...
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
