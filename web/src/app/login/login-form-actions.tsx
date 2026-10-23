import { ArrowRight, LoaderCircle } from "lucide-react";

import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";

export function LoginFormActions({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <Button
        type="submit"
        className="group relative h-10 w-full rounded-lg bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.14)] transition-all duration-150 hover:-translate-y-[1px] hover:bg-primary/90 disabled:opacity-50"
        disabled={state.isSubmitting}
        aria-disabled={state.isSubmitting}
      >
        <span className="relative z-10 flex items-center justify-center gap-2 text-sm font-medium tracking-[-0.01em]">
          {state.isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          <span>{state.isRegisterMode ? "注册并进入工作台" : "登录工作台"}</span>
          {!state.isSubmitting ? (
            <ArrowRight
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          ) : null}
        </span>
      </Button>
    </div>
  );
}
