import { useState } from "react";
import { toast } from "sonner";

import { usePersistedCountdown } from "@/app/login/use-persisted-countdown";
import { isRegistrationEmailValid } from "@/app/login/use-registration-email";
import { resetPasswordByEmail, sendPasswordResetEmailCode } from "@/lib/api";

const RESET_OTP_COUNTDOWN_KEY = "shengtu:otp-countdown:password-reset";

export function usePasswordReset(
  enabled: boolean | null,
  codeLength: number,
  defaultResendSeconds: number,
  onSuccess: (email: string) => void,
) {
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [resetEmail, setResetEmailState] = useState("");
  const [resetEmailCode, setResetEmailCodeState] = useState("");
  const [resetNewPassword, setResetNewPasswordState] = useState("");
  const [resetConfirmPassword, setResetConfirmPasswordState] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetCodeCountdown, startResetCodeCountdown] = usePersistedCountdown(RESET_OTP_COUNTDOWN_KEY);
  const [isSendingResetCode, setIsSendingResetCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const setResetEmail = (value: string) => {
    if (resetError) setResetError(null);
    setResetEmailState(value);
  };
  const setResetEmailCode = (value: string) => {
    if (resetError) setResetError(null);
    setResetEmailCodeState(value);
  };
  const setResetNewPassword = (value: string) => {
    if (resetError) setResetError(null);
    setResetNewPasswordState(value);
  };
  const setResetConfirmPassword = (value: string) => {
    if (resetError) setResetError(null);
    setResetConfirmPasswordState(value);
  };

  const openPasswordReset = (initialEmail?: string) => {
    setResetEmailState(isRegistrationEmailValid(initialEmail || "") ? String(initialEmail).trim().toLowerCase() : "");
    setResetEmailCodeState("");
    setResetNewPasswordState("");
    setResetConfirmPasswordState("");
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetError(null);
    setPasswordResetOpen(true);
  };

  const setPasswordResetOpenSafely = (open: boolean) => {
    if (isSendingResetCode || isResettingPassword) return;
    if (!open) setResetError(null);
    setPasswordResetOpen(open);
  };

  const sendResetCode = async () => {
    const email = resetEmail.trim().toLowerCase();
    if (!isRegistrationEmailValid(email)) {
      setResetError("请输入有效的注册邮箱地址");
      return;
    }
    if (enabled === false) {
      setResetError("平台尚未配置密码找回邮件，请联系管理员");
      return;
    }
    setResetError(null);
    setIsSendingResetCode(true);
    try {
      const result = await sendPasswordResetEmailCode(email);
      setResetEmailState(email);
      startResetCodeCountdown(Math.max(1, Number(result.retry_after_seconds) || defaultResendSeconds));
      toast.success("验证码已发送", { description: "若该邮箱已注册，请检查收件箱和垃圾邮件。" });
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setIsSendingResetCode(false);
    }
  };

  const submitPasswordReset = async () => {
    const email = resetEmail.trim().toLowerCase();
    const emailCode = resetEmailCode.trim();
    if (!isRegistrationEmailValid(email)) {
      setResetError("请输入有效的注册邮箱地址");
      return;
    }
    if (emailCode.length !== codeLength) {
      setResetError(`请输入 ${codeLength} 位邮箱验证码`);
      return;
    }
    if (resetNewPassword.length < 8) {
      setResetError("新密码至少需要 8 位字符");
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("两次输入的新密码不一致");
      return;
    }
    setResetError(null);
    setIsResettingPassword(true);
    try {
      await resetPasswordByEmail(email, emailCode, resetNewPassword);
      setPasswordResetOpen(false);
      onSuccess(email);
      toast.success("密码已重置", { description: "请使用新密码登录。" });
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "密码重置失败");
    } finally {
      setIsResettingPassword(false);
    }
  };

  return {
    passwordResetOpen, resetEmail, resetEmailCode, resetNewPassword, resetConfirmPassword,
    showResetPassword, showResetConfirmPassword, resetError,
    resetCodeCountdown, isSendingResetCode, isResettingPassword,
    setPasswordResetOpen: setPasswordResetOpenSafely, setResetEmail, setResetEmailCode,
    setResetNewPassword, setResetConfirmPassword,
    setShowResetPassword, setShowResetConfirmPassword,
    openPasswordReset, sendResetCode, submitPasswordReset,
  };
}
