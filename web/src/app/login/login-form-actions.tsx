import { ArrowRight, LoaderCircle } from "lucide-react";

import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";

export function LoginFormActions({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Button
        type="submit"
        className="group relative h-12 w-full overflow-hidden rounded-[1.35rem] bg-[#1456f0] text-white shadow-[0_14px_32px_rgba(20,86,240,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1048ce] hover:shadow-[0_18px_40px_rgba(20,86,240,0.32)] focus-visible:ring-2 focus-visible:ring-[#1456f0]/40 disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none"
        disabled={state.isSubmitting}
        aria-disabled={state.isSubmitting}
      >
        <span className="pointer-events-none absolute inset-x-4 top-1 h-3 rounded-full bg-white/20 blur-sm" />
        <span className="relative z-10 flex items-center justify-center gap-2 font-semibold tracking-[-0.01em]">
          {state.isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          )}
          <span>{state.isRegisterMode ? "注册并进入创作台" : "登录创作台"}</span>
        </span>
      </Button>
    </div>
  );
}
