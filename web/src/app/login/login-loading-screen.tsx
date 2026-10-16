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
      <LoaderCircle className="size-5 animate-spin text-amber-700/70 dark:text-amber-200/60" aria-hidden="true" />
    </div>
  );
}
