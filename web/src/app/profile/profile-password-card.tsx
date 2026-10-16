import { CheckCircle2, Coins, LoaderCircle, LockKeyhole, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProfileCredits } from "@/lib/api";
import type { StoredAuthSession } from "@/store/auth";

type ProfilePasswordCardProps = {
  session: StoredAuthSession;
  credits: ProfileCredits | null;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  isChangingPassword: boolean;
  isCheckingIn: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onChangePassword: () => void;
  onCheckin: () => void;
};

export function ProfilePasswordCard({
  session,
  credits,
  currentPassword,
  newPassword,
  confirmPassword,
  isChangingPassword,
  isCheckingIn,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onChangePassword,
  onCheckin,
}: ProfilePasswordCardProps) {
  return (
    <Card className="order-2">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300">
            <LockKeyhole className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">登录密码</CardTitle>
            <CardDescription className="truncate">
              {session.provider === "local" ? "本地账号" : "外部登录"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {session.provider === "local" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-current-password">当前密码</FieldLabel>
              <Input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => onCurrentPasswordChange(event.target.value)} className="h-10 rounded-lg" />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-new-password">新密码</FieldLabel>
              <Input id="profile-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => onNewPasswordChange(event.target.value)} className="h-10 rounded-lg" />
              <FieldDescription>密码长度不能少于 8 位。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-confirm-password">确认新密码</FieldLabel>
              <Input id="profile-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.target.value)} className="h-10 rounded-lg" />
            </Field>
            <div className="flex justify-end">
              <Button type="button" className="h-10 rounded-lg" onClick={onChangePassword} disabled={isChangingPassword}>
                {isChangingPassword ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                修改密码
              </Button>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button id="password-checkin-button" type="button" className="h-10 rounded-lg" onClick={onCheckin} disabled={isCheckingIn || Boolean(credits?.checked_in_today)}>
                {isCheckingIn ? <LoaderCircle className="size-4 animate-spin" /> : credits?.checked_in_today ? <CheckCircle2 className="size-4" /> : <Coins className="size-4" />}
                {credits?.checked_in_today ? "今日已签到" : "签到领积分"}
              </Button>
            </div>
          </FieldGroup>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            外部登录账号不使用本地密码。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
