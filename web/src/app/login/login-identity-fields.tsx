import { BadgeCheck, Mail, UserPlus, UserRound } from "lucide-react";

import { LoginFormField } from "@/app/login/login-form-field";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginIdentityFields({ state }: { state: LoginPageState }) {
  if (!state.isRegisterMode) {
    return (
      <LoginFormField
        id="login-username"
        label="用户名或邮箱"
        icon={UserRound}
        autoComplete="username"
        autoFocus
        value={state.username}
        onChange={state.setUsername}
        placeholder="旧用户输入用户名，新用户输入邮箱"
      />
    );
  }

  return (
    <>
      <LoginFormField
        id="register-email"
        label="邮箱"
        icon={Mail}
        type="email"
        autoComplete="email"
        autoFocus
        value={state.email}
        onChange={state.setEmail}
        placeholder="用于注册和后续登录"
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="register-email-code" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            邮箱验证码
          </label>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {state.emailCodeLength} 位
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <div className="relative">
            <BadgeCheck className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="register-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={state.emailCode}
              maxLength={state.emailCodeLength}
              onChange={(event) => state.setEmailCode(event.target.value.replace(/\D/g, "").slice(0, state.emailCodeLength))}
              placeholder="验证码"
              className="h-10 rounded-lg border-slate-200 bg-white pl-10 dark:border-white/10 dark:bg-white/[0.04]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg text-xs"
            disabled={state.isSendingEmailCode || state.emailCodeCountdown > 0 || state.emailRegistrationEnabled === false}
            onClick={() => void state.sendEmailCode()}
          >
            {state.isSendingEmailCode
              ? "发送中"
              : state.emailCodeCountdown > 0
                ? `${state.emailCodeCountdown}s`
                : "获取验证码"}
          </Button>
        </div>
        {state.emailRegistrationEnabled === false ? (
          <p className="text-xs leading-5 text-rose-600 dark:text-rose-300">邮件服务未配置，暂时无法注册，请联系管理员。</p>
        ) : null}
      </div>
      <LoginFormField
        id="login-display-name"
        label="昵称"
        icon={UserPlus}
        autoComplete="nickname"
        value={state.displayName}
        onChange={state.setDisplayName}
        placeholder="可选，展示名称"
        hint="可选"
      />
    </>
  );
}
