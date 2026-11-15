import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";

import { LoginAgreements } from "@/app/login/login-agreements";
import { LoginFormActions } from "@/app/login/login-form-actions";
import { LoginFormField } from "@/app/login/login-form-field";
import { LoginIdentityFields } from "@/app/login/login-identity-fields";
import { PasswordResetDialog } from "@/app/login/password-reset-dialog";
import { LoginTermsDialog } from "@/app/login/login-terms-dialog";
import { appTitle, projectName, type LoginAppMeta } from "@/app/login/login-utils";
import type { LoginPageState } from "@/app/login/use-login-page";
import { cn } from "@/lib/utils";

export function LoginFormPanel({ appMeta, state }: { appMeta: LoginAppMeta; state: LoginPageState }) {
  return (
    <section
      className="flex min-h-[min(100%,32rem)] flex-col justify-center px-5 py-7 sm:min-h-[500px] sm:px-10 sm:py-8 lg:px-12"
      aria-labelledby="login-heading"
    >
      <div className="flex flex-col gap-6 transition-[gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:gap-6">
        <LoginBrand appMeta={appMeta} />

        <div className="flex flex-col gap-4">
          <LoginHeading appMeta={appMeta} isRegisterMode={state.isRegisterMode} />
          {state.registrationEnabled !== false ? <ModeTabs state={state} /> : null}
        </div>

        <form
          id="login-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void state.handleSubmit();
          }}
          aria-busy={state.isSubmitting}
          noValidate
        >
          {state.errorMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200/90 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-medium">{state.errorMessage}</span>
            </div>
          ) : null}

          <LoginIdentityFields state={state} />

          <LoginFormField
            id="login-password"
            label="密码"
            icon={KeyRound}
            disabled={state.isSubmitting}
            passwordToggle
            showPassword={state.showPassword}
            onTogglePassword={() => state.setShowPassword((v) => !v)}
            autoComplete={state.isRegisterMode ? "new-password" : "current-password"}
            value={state.password}
            onChange={state.setPassword}
            placeholder={state.isRegisterMode ? "设置登录密码（至少 8 位）" : "请输入密码"}
            hint={state.isRegisterMode ? "≥ 8 位" : undefined}
          />

          <LoginAgreements state={state} />

          <LoginFormActions state={state} />
        </form>

        <p className="sr-only" aria-live="polite">
          {state.isRegisterMode ? "当前为注册模式" : "当前为登录模式"}
        </p>
      </div>

      <LoginTermsDialog open={state.termsOpen} onOpenChange={state.setTermsOpen} />
      <PasswordResetDialog state={state} />
    </section>
  );
}

function ModeTabs({ state }: { state: LoginPageState }) {
  return (
    <div
      className="grid grid-cols-2 rounded-2xl border border-[#dfe7f1] bg-[#edf2f8]/80 p-1 dark:border-amber-900/40 dark:bg-amber-950/30"
      role="tablist"
      aria-label="登录或注册"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!state.isRegisterMode}
        className={cn(
          "h-9 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/35",
          !state.isRegisterMode
            ? "bg-white text-[#1456f0] shadow-sm dark:bg-stone-900 dark:text-amber-50"
            : "text-[#45515e] hover:text-[#222222] dark:text-amber-100/50 dark:hover:text-amber-50",
        )}
        onClick={() => state.setIsRegisterMode(false)}
        disabled={state.isSubmitting}
      >
        登录
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={state.isRegisterMode}
        className={cn(
          "h-9 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/35",
          state.isRegisterMode
            ? "bg-white text-[#1456f0] shadow-sm dark:bg-stone-900 dark:text-amber-50"
            : "text-[#45515e] hover:text-[#222222] dark:text-amber-100/50 dark:hover:text-amber-50",
        )}
        onClick={() => state.setIsRegisterMode(true)}
        disabled={state.isSubmitting}
      >
        注册
      </button>
    </div>
  );
}

function LoginBrand({ appMeta }: { appMeta: LoginAppMeta }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo-mark.svg"
        alt=""
        aria-hidden="true"
        className="size-10 rounded-[14px] shadow-[0_12px_16px_-4px_rgba(20,86,240,0.16)] sm:size-11 sm:rounded-[16px]"
      />
      <div className="grid min-w-0 leading-none">
        <div className="truncate text-sm font-semibold tracking-[-0.02em] text-[#222222] dark:text-amber-50">
          {appTitle(appMeta)}
        </div>
        <div className="mt-1 truncate text-[10px] font-medium tracking-[0.26em] text-[#8e8e93] uppercase dark:text-amber-100/45">
          {projectName(appMeta)}
        </div>
      </div>
    </div>
  );
}

function LoginHeading({ appMeta, isRegisterMode }: { appMeta: LoginAppMeta; isRegisterMode: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1456f0]/20 bg-[#edf4ff] px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#1456f0] uppercase shadow-[0_4px_12px_rgba(20,86,240,0.06)] dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100/80">
        <ShieldCheck className="size-3.5 text-[#1456f0] dark:text-amber-300" aria-hidden="true" />
        Secure Access
      </div>
      <div className="flex flex-col gap-1.5">
        <h1
          id="login-heading"
          className="text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.04em] text-[#222222] transition-opacity duration-200 dark:text-amber-50 sm:text-[2.25rem]"
        >
          {isRegisterMode ? "创建账号" : "欢迎回来"}
        </h1>
        <p className="max-w-[22rem] text-sm leading-6 text-[#45515e] dark:text-amber-100/55">
          {isRegisterMode
            ? `注册后即可使用 ${appTitle(appMeta)} 多模型生图工作台。`
            : `登录后进入 ${appTitle(appMeta)} · GPT 与 Grok 渠道一体接入。`}
        </p>
      </div>
    </div>
  );
}
