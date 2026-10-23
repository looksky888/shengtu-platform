import { BadgeCheck, KeyRound, Mail } from "lucide-react";

import { LoginFormField } from "@/app/login/login-form-field";
import type { LoginPageState } from "@/app/login/use-login-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function PasswordResetDialog({ state }: { state: LoginPageState }) {
  return (
    <Dialog open={state.passwordResetOpen} onOpenChange={state.setPasswordResetOpen}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>找回密码</DialogTitle>
          <DialogDescription className="leading-6">
            输入注册邮箱并获取验证码。旧用户名账号若尚未绑定邮箱，请联系管理员重置。
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void state.submitPasswordReset();
          }}
          noValidate
        >
          <LoginFormField
            id="reset-email"
            label="注册邮箱"
            icon={Mail}
            type="email"
            autoComplete="email"
            autoFocus
            value={state.resetEmail}
            onChange={state.setResetEmail}
            placeholder="请输入注册邮箱"
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="reset-email-code" className="text-xs font-medium text-foreground">
                邮箱验证码
              </label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {state.passwordResetCodeLength} 位数字
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_7.25rem] gap-2">
              <div className="relative">
                <BadgeCheck
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="reset-email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={state.resetEmailCode}
                  maxLength={state.passwordResetCodeLength}
                  onChange={(event) => state.setResetEmailCode(
                    event.target.value.replace(/\D/g, "").slice(0, state.passwordResetCodeLength),
                  )}
                  placeholder="验证码"
                  className="h-10 rounded-lg border-input bg-surface pl-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg text-xs"
                disabled={state.isSendingResetCode || state.resetCodeCountdown > 0 || state.passwordResetEnabled === false}
                onClick={() => void state.sendResetCode()}
              >
                {state.isSendingResetCode
                  ? "发送中…"
                  : state.resetCodeCountdown > 0
                    ? `${state.resetCodeCountdown}s`
                    : "获取验证码"}
              </Button>
            </div>
          </div>

          <LoginFormField
            id="reset-new-password"
            label="新密码"
            icon={KeyRound}
            type="password"
            autoComplete="new-password"
            value={state.resetNewPassword}
            onChange={state.setResetNewPassword}
            placeholder="至少 8 位"
            hint="≥ 8 位"
          />
          <LoginFormField
            id="reset-confirm-password"
            label="确认新密码"
            icon={KeyRound}
            type="password"
            autoComplete="new-password"
            value={state.resetConfirmPassword}
            onChange={state.setResetConfirmPassword}
            placeholder="再次输入新密码"
          />

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => state.setPasswordResetOpen(false)}
              disabled={state.isResettingPassword || state.isSendingResetCode}
            >
              取消
            </Button>
            <Button type="submit" disabled={state.isResettingPassword || state.isSendingResetCode}>
              {state.isResettingPassword ? "重置中…" : "重置密码"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
