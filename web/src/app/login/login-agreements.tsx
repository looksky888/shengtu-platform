import { TERMS_SHORT_LABEL } from "@/app/login/login-terms";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginAgreements({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-surface-muted/55 px-3.5 py-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id="login-remember-me"
          aria-label="记住登录状态"
          checked={state.rememberMe}
          onCheckedChange={(value) => state.setRememberMe(value === true)}
          disabled={state.isSubmitting}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">记住登录状态</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            勾选后当前设备约 30 天内保持免密通行
          </span>
        </span>
      </label>

      <div className="h-px bg-border/80" aria-hidden="true" />

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="login-agree-terms"
          aria-label="同意服务条款"
          checked={state.agreedToTerms}
          onCheckedChange={(value) => state.setAgreedToTerms(value === true)}
          disabled={state.isSubmitting}
          required
          aria-required="true"
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          <label htmlFor="login-agree-terms" className="cursor-pointer">
            <span className="font-medium text-foreground">我已阅读并同意</span>{" "}
          </label>
          <button
            type="button"
            className="font-semibold text-foreground underline decoration-border-strong underline-offset-3 transition hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            onClick={() => state.setTermsOpen(true)}
          >
            {TERMS_SHORT_LABEL}
          </button>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            请合法合规使用创作工具；违规生成行为与后果由使用者独立承担。
          </span>
        </div>
      </div>
    </div>
  );
}
