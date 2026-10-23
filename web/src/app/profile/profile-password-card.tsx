import { useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Save } from "lucide-react";

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

type PasswordFieldInputProps = {
  id: string;
  label: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
};

function PasswordFieldInput({
  id,
  label,
  autoComplete,
  placeholder,
  value,
  visible,
  onToggleVisible,
  onChange,
}: PasswordFieldInputProps) {
  const toggleLabel = visible ? `隐藏${label}` : `显示${label}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 pr-9"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {visible ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>
    </Field>
  );
}

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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
            <PasswordFieldInput
              id="profile-current-password"
              label="当前密码"
              autoComplete="current-password"
              placeholder="输入当前登录密码"
              value={currentPassword}
              visible={showCurrentPassword}
              onToggleVisible={() =>
                setShowCurrentPassword((current) => !current)
              }
              onChange={onCurrentPasswordChange}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <PasswordFieldInput
                id="profile-new-password"
                label="新密码"
                autoComplete="new-password"
                placeholder="不少于 8 位字符"
                value={newPassword}
                visible={showNewPassword}
                onToggleVisible={() =>
                  setShowNewPassword((current) => !current)
                }
                onChange={onNewPasswordChange}
              />
              <PasswordFieldInput
                id="profile-confirm-password"
                label="确认新密码"
                autoComplete="new-password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                visible={showConfirmPassword}
                onToggleVisible={() =>
                  setShowConfirmPassword((current) => !current)
                }
                onChange={onConfirmPasswordChange}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-muted-foreground">
                密码长度至少 8 位
              </span>
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
