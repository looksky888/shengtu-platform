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
      className="flex min-h-[min(100%,32rem)] flex-col justify-center bg-surface px-5 py-7 sm:min-h-[520px] sm:px-9 sm:py-8 lg:border-l lg:border-border/80 lg:px-10 xl:px-11"
      aria-labelledby="login-heading"
    >
      <div className="flex flex-col gap-5 transition-[gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:gap-6">
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
              className="flex items-start gap-2.5 rounded-lg border border-rose-200/90 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
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
            passwordToggle
            showPassword={state.showPassword}
            onTogglePassword={() => state.setShowPassword((v) => !v)}
            autoComplete={state.isRegisterMode ? "new-password" : "current-password"}
            value={state.password}
            onChange={state.setPassword}
            placeholder={state.isRegisterMode ? "设置登录密码（至少 8 位）" : "请输入密码"}
            hint={state.isRegisterMode ? "≥ 8 位" : undefined}
          />

          {!state.isRegisterMode && state.passwordResetEnabled === true ? (
            <button
              type="button"
              className="-mt-2 self-end rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
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
          {state.isRegisterMode ? "当前为注册账号模式" : "当前为账号登录模式"}
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
      className="grid grid-cols-2 rounded-xl border border-border/80 bg-surface-muted p-1"
      role="tablist"
      aria-label="账号登录或注册账号"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!state.isRegisterMode}
        className={cn(
          "h-8.5 rounded-lg text-xs font-semibold transition-all sm:text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          !state.isRegisterMode
            ? "bg-surface text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-zinc-800 dark:text-zinc-50"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => state.setIsRegisterMode(false)}
        disabled={state.isSubmitting}
      >
        账号登录
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={state.isRegisterMode}
        className={cn(
          "h-8.5 rounded-lg text-xs font-semibold transition-all sm:text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          state.isRegisterMode
            ? "bg-surface text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-zinc-800 dark:text-zinc-50"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => state.setIsRegisterMode(true)}
        disabled={state.isSubmitting}
      >
        注册账号
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
        className="size-9 rounded-[11px] ring-1 ring-black/[0.08] sm:size-9.5 dark:ring-white/[0.14]"
      />
      <div className="grid min-w-0 leading-none">
        <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {appTitle(appMeta)}
        </div>
        <div className="mt-1.5 truncate font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {projectName(appMeta)}
        </div>
      </div>
    </div>
  );
}

function LoginHeading({ appMeta, isRegisterMode }: { appMeta: LoginAppMeta; isRegisterMode: boolean }) {
  const brand = appTitle(appMeta);
  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border/80 bg-surface-muted/80 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        <ShieldCheck className="size-3 text-foreground/75" aria-hidden="true" />
        <span>STUDIO ACCESS</span>
      </div>
      <div className="flex flex-col gap-1">
        <h1
          id="login-heading"
          className="text-2xl leading-tight font-semibold tracking-[-0.025em] text-foreground transition-opacity duration-200 sm:text-[1.65rem]"
        >
          {isRegisterMode ? "创建工作台账号" : "欢迎回到工作台"}
        </h1>
        <p className="max-w-[24rem] text-xs leading-5.5 text-muted-foreground sm:text-[13px]">
          {isRegisterMode
            ? `注册后即可进入 ${brand}，开启影像与多轨视频创作。`
            : `验证身份以进入 ${brand} 影像与视频创作空间。`}
        </p>
      </div>
    </div>
  );
}
