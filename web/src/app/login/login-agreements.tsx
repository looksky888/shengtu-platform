import { TERMS_SHORT_LABEL } from "@/app/login/login-terms";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginAgreements({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id="login-remember-me"
          aria-label="记住登录状态"
          checked={state.rememberMe}
          onCheckedChange={(value) => state.setRememberMe(value === true)}
          disabled={state.isSubmitting}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <span className="font-medium text-slate-800 dark:text-slate-100">记住我</span>
          <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
            勾选后本设备约 30 天保持登录状态
          </span>
        </span>
      </label>

      <div className="h-px bg-slate-200/80 dark:bg-white/10" aria-hidden="true" />

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
        <div className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <label htmlFor="login-agree-terms" className="cursor-pointer">
            <span className="font-medium text-slate-800 dark:text-slate-100">我已阅读并同意</span>{" "}
          </label>
          <button
            type="button"
            className="font-semibold text-[#1456f0] underline decoration-blue-300 underline-offset-2 transition hover:text-[#0f49cf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 dark:text-blue-400 dark:hover:text-blue-300"
            onClick={() => state.setTermsOpen(true)}
          >
            {TERMS_SHORT_LABEL}
          </button>
          <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
            登录与注册均须勾选。您须合法使用本服务；违规使用后果由您自行承担。
          </span>
        </div>
      </div>
    </div>
  );
}
