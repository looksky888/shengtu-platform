import { KeyRound, ShieldCheck } from "lucide-react";

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
      <div className="flex flex-col gap-6 transition-[gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:gap-7">
        <LoginBrand appMeta={appMeta} />

        <div className="flex flex-col gap-4">
          <LoginHeading appMeta={appMeta} isRegisterMode={state.isRegisterMode} />
          {state.registrationEnabled !== false ? <ModeTabs state={state} /> : null}
        </div>

        <form
          id="login-form"
          className="flex flex-col gap-4 sm:gap-4.5"
          onSubmit={(event) => {
            event.preventDefault();
            void state.handleSubmit();
          }}
          aria-busy={state.isSubmitting}
          noValidate
        >
          <LoginIdentityFields state={state} />

          <LoginFormField
            id="login-password"
            label="密码"
            icon={KeyRound}
            passwordToggle
            showPassword={state.showPassword}
            onTogglePassword={() => state.setShowPassword((v) => !v)}
            autoComplete={state.isRegisterMode ? "new-password" : "current-password"}
            value={state.password}
            onChange={state.setPassword}
            placeholder={state.isRegisterMode ? "至少 8 位" : "请输入密码"}
            hint={state.isRegisterMode ? "≥ 8 位" : undefined}
          />

          {!state.isRegisterMode && state.passwordResetEnabled === true ? (
            <button
              type="button"
              className="-mt-2 self-end rounded-md px-1 py-0.5 text-xs font-semibold text-amber-700 transition hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 dark:text-amber-300 dark:hover:text-amber-100"
              onClick={() => state.openPasswordReset(state.username)}
              disabled={state.isSubmitting}
            >
              忘记密码？
            </button>
          ) : null}

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
      className="grid grid-cols-2 rounded-2xl border border-amber-100/90 bg-amber-50/50 p-1 dark:border-amber-900/40 dark:bg-amber-950/30"
      role="tablist"
      aria-label="登录或注册"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!state.isRegisterMode}
        className={cn(
          "h-9 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45",
          !state.isRegisterMode
            ? "bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-amber-50"
            : "text-stone-500 hover:text-stone-800 dark:text-amber-100/50 dark:hover:text-amber-50",
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
          "h-9 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45",
          state.isRegisterMode
            ? "bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-amber-50"
            : "text-stone-500 hover:text-stone-800 dark:text-amber-100/50 dark:hover:text-amber-50",
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
        className="size-10 rounded-[14px] shadow-[0_12px_16px_-4px_rgba(180,83,9,0.16)] sm:size-11 sm:rounded-[16px]"
      />
      <div className="grid min-w-0 leading-none">
        <div className="truncate text-sm font-semibold tracking-[-0.02em] text-stone-900 dark:text-amber-50">
          {appTitle(appMeta)}
        </div>
        <div className="truncate text-[10px] font-medium tracking-[0.28em] text-stone-400 uppercase dark:text-amber-100/45">
          {projectName(appMeta)}
        </div>
      </div>
    </div>
  );
}

function LoginHeading({ appMeta, isRegisterMode }: { appMeta: LoginAppMeta; isRegisterMode: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200/90 bg-amber-50/90 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-amber-900/80 uppercase shadow-[0_4px_12px_rgba(180,83,9,0.06)] dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100/80">
        <ShieldCheck className="size-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        Secure Access
      </div>
      <div className="flex flex-col gap-1.5">
        <h1
          id="login-heading"
          className="text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.04em] text-stone-900 transition-opacity duration-200 dark:text-amber-50 sm:text-[2.35rem]"
        >
          {isRegisterMode ? "创建账号" : "欢迎回来"}
        </h1>
        <p className="max-w-[22rem] text-sm leading-6 text-stone-500 dark:text-amber-100/55">
          {isRegisterMode
            ? `注册后即可使用 ${appTitle(appMeta)} 多模型生图工作台。`
            : `登录后进入 ${appTitle(appMeta)} · GPT 与 Grok 渠道一体接入。`}
        </p>
      </div>
    </div>
  );
}
