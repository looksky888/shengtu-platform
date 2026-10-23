import { LoaderCircle } from "lucide-react";

import { loginBackgroundClass } from "@/app/login/login-utils";

export function LoginLoadingScreen() {
  return (
    <div
      className={`${loginBackgroundClass} fixed inset-0 z-50 grid min-h-svh w-screen place-items-center overflow-hidden px-4 py-6`}
      role="status"
      aria-live="polite"
      aria-label="正在检查登录状态"
    >
      <div className="flex items-center gap-2.5 rounded-full border border-border/80 bg-surface/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-2xs">
        <LoaderCircle className="size-3.5 animate-spin text-foreground" aria-hidden="true" />
        <span>正在验证工作台通行状态…</span>
      </div>
    </div>
  );
}
