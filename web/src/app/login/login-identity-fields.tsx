import { BadgeCheck, Gift, Mail, UserPlus, UserRound } from "lucide-react";

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
        disabled={state.isSubmitting}
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
        disabled={state.isSubmitting}
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
              disabled={state.isSubmitting}
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
            disabled={state.isSubmitting || state.isSendingEmailCode || state.emailCodeCountdown > 0 || state.emailRegistrationEnabled === false}
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
        disabled={state.isSubmitting}
        value={state.displayName}
        onChange={state.setDisplayName}
        placeholder="可选，工作台内显示名称"
        hint="可选"
      />
      {state.hasUrlInviteCode && state.inviteCode ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Gift className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              已绑定专属邀请码：<strong className="font-mono font-semibold">{state.inviteCode}</strong>
            </span>
          </span>
          <button
            type="button"
            disabled={state.isSubmitting}
            onClick={() => state.setInviteCode("")}
            className="shrink-0 text-[11px] font-medium underline underline-offset-2 opacity-80 transition hover:opacity-100 disabled:pointer-events-none"
          >
            清除
          </button>
        </div>
      ) : state.inviteInputExpanded ? (
        <LoginFormField
          id="register-invite-code"
          label="邀请码"
          icon={Gift}
          autoComplete="off"
          disabled={state.isSubmitting}
          value={state.inviteCode}
          onChange={state.setInviteCode}
          placeholder="可选，填写邀请码领取创作积分"
          hint="可选"
        />
      ) : (
        <button
          type="button"
          disabled={state.isSubmitting}
          onClick={() => state.setInviteInputExpanded(true)}
          className="inline-flex w-fit items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-50"
        >
          <Gift className="size-3.5 text-subtle-foreground" aria-hidden="true" />
          <span>有邀请码？点击填写（可选）</span>
        </button>
      )}
    </>
  );
}
