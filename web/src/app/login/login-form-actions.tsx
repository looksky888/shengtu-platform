import { ArrowRight, LoaderCircle } from "lucide-react";

import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";

export function LoginFormActions({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Button
        type="submit"
        className="relative h-10 w-full rounded-lg bg-[#1456f0] text-white shadow-xs transition-all duration-150 hover:bg-[#0f49cf] focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
        disabled={state.isSubmitting}
        aria-disabled={state.isSubmitting}
      >
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
