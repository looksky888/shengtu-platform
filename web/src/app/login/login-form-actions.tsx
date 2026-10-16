import { ArrowRight, LoaderCircle } from "lucide-react";

import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";

export function LoginFormActions({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Button
        type="submit"
        className="relative h-12 w-full overflow-hidden rounded-[1.35rem] bg-stone-900 text-white shadow-[0_14px_32px_rgba(28,25,23,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_18px_40px_rgba(28,25,23,0.28)] focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:translate-y-0 disabled:bg-stone-400 disabled:shadow-none dark:bg-amber-100 dark:text-stone-900 dark:hover:bg-amber-50 dark:disabled:bg-amber-100/40 dark:disabled:text-stone-600"
        disabled={state.isSubmitting}
        aria-disabled={state.isSubmitting}
      >
        <span className="pointer-events-none absolute inset-x-4 top-1 h-3 rounded-full bg-white/20 blur-sm dark:bg-white/40" />
        <span className="relative z-10 flex items-center justify-center gap-2 font-semibold tracking-[-0.01em]">
          {state.isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight className="size-4" aria-hidden="true" />
          )}
          <span>{state.isRegisterMode ? "注册并进入" : "登录控制台"}</span>
        </span>
      </Button>
    </div>
  );
}
