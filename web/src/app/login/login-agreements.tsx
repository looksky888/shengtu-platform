import { toast } from "sonner";

import { TERMS_SHORT_LABEL } from "@/app/login/login-terms";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginAgreements({ state }: { state: LoginPageState }) {
  const handleForgotPassword = () => {
    if (state.passwordResetEnabled === true) {
      state.openPasswordReset(state.username);
      return;
    }
    toast.info("当前未开启自助邮件找回，请联系工作台管理员协助重置密码");
  };

  return (
    <div className="flex flex-col gap-3 pt-0.5">
      {/* Row 1: Remember 30-day session + Forgot password / register helper */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <label
          htmlFor="login-remember-me"
          className="inline-flex cursor-pointer items-center gap-2 select-none text-muted-foreground transition-colors hover:text-foreground"
        >
          <Checkbox
            id="login-remember-me"
            aria-label="保持 30 天登录状态"
            checked={state.rememberMe}
            onCheckedChange={(value) => state.setRememberMe(value === true)}
            disabled={state.isSubmitting}
          />
          <span className="font-medium text-foreground/90">保持 30 天登录状态</span>
        </label>

        {!state.isRegisterMode ? (
          <button
            type="button"
            className="rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-50"
            onClick={handleForgotPassword}
            disabled={state.isSubmitting}
          >
            忘记密码？
          </button>
        ) : (
          <span className="font-mono text-[11px] text-subtle-foreground">
            通行证加密保护
          </span>
        )}
      </div>

      {/* Row 2: Compact single-line terms agreement */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Checkbox
          id="login-agree-terms"
          aria-label="同意服务条款"
          checked={state.agreedToTerms}
          onCheckedChange={(value) => state.setAgreedToTerms(value === true)}
          disabled={state.isSubmitting}
          required
          aria-required="true"
        />
        <label
          htmlFor="login-agree-terms"
          className="cursor-pointer select-none transition-colors hover:text-foreground"
        >
          我已阅读并同意
        </label>
        <button
          type="button"
          className="-ml-1 font-medium text-foreground underline decoration-border-strong underline-offset-3 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          onClick={() => state.setTermsOpen(true)}
        >
          {TERMS_SHORT_LABEL}
        </button>
      </div>
    </div>
  );
}
