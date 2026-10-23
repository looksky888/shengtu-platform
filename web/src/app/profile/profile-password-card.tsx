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
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
            <LockKeyhole className="size-4.5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">安全设置</CardTitle>
            <CardDescription className="truncate">
              {session.provider === "local"
                ? "定期更新本地账号登录密码"
                : "外部登录身份托管"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {session.provider === "local" ? (
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="profile-current-password">
                当前密码
              </FieldLabel>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                placeholder="输入当前登录密码"
                value={currentPassword}
                onChange={(event) =>
                  onCurrentPasswordChange(event.target.value)
                }
                className="h-9"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field>
                <FieldLabel htmlFor="profile-new-password">新密码</FieldLabel>
                <Input
                  id="profile-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="不少于 8 位字符"
                  value={newPassword}
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  className="h-9"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-confirm-password">
                  确认新密码
                </FieldLabel>
                <Input
                  id="profile-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={(event) =>
                    onConfirmPasswordChange(event.target.value)
                  }
                  className="h-9"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-muted-foreground">密码长度至少 8 位</span>
              <Button
                type="button"
                size="sm"
                onClick={onChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                更新密码
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
