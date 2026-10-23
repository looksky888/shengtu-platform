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
        placeholder="输入账号用户名或注册邮箱"
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
        placeholder="用于注册验证与后续登录"
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="register-email-code" className="text-xs font-medium text-foreground">
            邮箱验证码
          </label>
          <span className="font-mono text-[11px] text-muted-foreground">
            {state.emailCodeLength} 位数字
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_7.25rem] gap-2">
          <div className="relative">
            <BadgeCheck
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle-foreground"
              aria-hidden="true"
            />
            <Input
              id="register-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={state.emailCode}
              maxLength={state.emailCodeLength}
              onChange={(event) => state.setEmailCode(event.target.value.replace(/\D/g, "").slice(0, state.emailCodeLength))}
              placeholder="输入验证码"
              className="h-10 rounded-lg border-input bg-surface pl-10 text-foreground placeholder:text-subtle-foreground focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-foreground/[0.06]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg border-border/90 bg-surface text-xs font-medium hover:border-border-strong hover:bg-surface-hover"
            disabled={state.isSendingEmailCode || state.emailCodeCountdown > 0 || state.emailRegistrationEnabled === false}
            onClick={() => void state.sendEmailCode()}
          >
            {state.isSendingEmailCode
              ? "发送中…"
              : state.emailCodeCountdown > 0
                ? `${state.emailCodeCountdown}s`
                : "获取验证码"}
          </Button>
        </div>
        {state.emailRegistrationEnabled === false ? (
          <p className="rounded-md border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5 text-xs leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            邮件服务未配置，暂时无法自助注册，请联系管理员。
          </p>
        ) : null}
      </div>
      <LoginFormField
        id="login-display-name"
        label="创作者昵称"
        icon={UserPlus}
        autoComplete="nickname"
        value={state.displayName}
        onChange={state.setDisplayName}
        placeholder="可选，工作台内显示名称"
        hint="可选"
      />
    </>
  );
}
