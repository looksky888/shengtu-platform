import { LoaderCircle, LockKeyhole, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { StoredAuthSession } from "@/store/auth";

type ProfilePasswordCardProps = {
  session: StoredAuthSession;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  isChangingPassword: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onChangePassword: () => void;
};

export function ProfilePasswordCard({
  session,
  currentPassword,
  newPassword,
  confirmPassword,
  isChangingPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onChangePassword,
}: ProfilePasswordCardProps) {
  return (
    <Card className="order-2">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-soft text-brand">
            <LockKeyhole className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">登录密码</CardTitle>
            <CardDescription className="truncate">
              {session.provider === "local"
                ? "修改本地账号登录密码"
                : "外部登录"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {session.provider === "local" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-current-password">
                当前密码
              </FieldLabel>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) =>
                  onCurrentPasswordChange(event.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-new-password">新密码</FieldLabel>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => onNewPasswordChange(event.target.value)}
              />
              <FieldDescription>密码长度不能少于 8 位。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-confirm-password">
                确认新密码
              </FieldLabel>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) =>
                  onConfirmPasswordChange(event.target.value)
                }
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                修改密码
              </Button>
            </div>
          </FieldGroup>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            外部登录账号不使用本地密码。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
