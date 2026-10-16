import { TERMS_SHORT_LABEL } from "@/app/login/login-terms";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginAgreements({ state }: { state: LoginPageState }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-100/90 bg-amber-50/40 px-3.5 py-3 dark:border-amber-900/40 dark:bg-amber-950/25">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id="login-remember-me"
          aria-label="记住登录状态"
          checked={state.rememberMe}
          onCheckedChange={(value) => state.setRememberMe(value === true)}
          disabled={state.isSubmitting}
          className="mt-0.5 border-amber-300 data-[state=checked]:border-amber-700 data-[state=checked]:bg-amber-700 dark:border-amber-700 dark:data-[state=checked]:border-amber-400 dark:data-[state=checked]:bg-amber-400 dark:data-[state=checked]:text-stone-900"
        />
        <span className="min-w-0 flex-1 text-[13px] leading-5 text-stone-600 dark:text-amber-100/70">
          <span className="font-medium text-stone-800 dark:text-amber-50/90">记住我</span>
          <span className="mt-0.5 block text-[12px] text-stone-500 dark:text-amber-100/45">
            勾选：本设备约 30 天保持登录（Cookie + 本地会话）。不勾选：关闭浏览器后需重新登录
          </span>
        </span>
      </label>

      <div className="h-px bg-amber-100/90 dark:bg-amber-900/40" aria-hidden="true" />

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="login-agree-terms"
          aria-label="同意服务条款"
          checked={state.agreedToTerms}
          onCheckedChange={(value) => state.setAgreedToTerms(value === true)}
          disabled={state.isSubmitting}
          required
          aria-required="true"
          className="mt-0.5 border-amber-300 data-[state=checked]:border-amber-700 data-[state=checked]:bg-amber-700 dark:border-amber-700 dark:data-[state=checked]:border-amber-400 dark:data-[state=checked]:bg-amber-400 dark:data-[state=checked]:text-stone-900"
        />
        <div className="min-w-0 flex-1 text-[13px] leading-5 text-stone-600 dark:text-amber-100/70">
          <label htmlFor="login-agree-terms" className="cursor-pointer">
            <span className="font-medium text-stone-800 dark:text-amber-50/90">我已阅读并同意</span>{" "}
          </label>
          <button
            type="button"
            className="font-semibold text-amber-800 underline decoration-amber-300/80 underline-offset-2 transition hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 dark:text-amber-200 dark:hover:text-amber-100"
            onClick={() => state.setTermsOpen(true)}
          >
            {TERMS_SHORT_LABEL}
          </button>
          <span className="mt-0.5 block text-[12px] text-stone-500 dark:text-amber-100/45">
            登录与注册均须勾选。您须合法使用本服务；违法犯罪、侵权等后果由您自行承担，与本项目无关。
          </span>
        </div>
      </div>
    </div>
  );
}
