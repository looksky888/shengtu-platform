import { useEffect, useState } from "react";
import { toast } from "sonner";

import { resetPasswordByEmail, sendPasswordResetEmailCode } from "@/lib/api";

import { isRegistrationEmailValid } from "@/app/login/use-registration-email";

export function usePasswordReset(
  enabled: boolean | null,
  codeLength: number,
  defaultResendSeconds: number,
  onSuccess: (email: string) => void,
) {
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailCode, setResetEmailCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetCodeCountdown, setResetCodeCountdown] = useState(0);
  const [isSendingResetCode, setIsSendingResetCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    if (resetCodeCountdown <= 0) return;
    const timer = window.setTimeout(() => setResetCodeCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resetCodeCountdown]);

  const openPasswordReset = (initialEmail?: string) => {
    setResetEmail(isRegistrationEmailValid(initialEmail || "") ? String(initialEmail).trim().toLowerCase() : "");
    setResetEmailCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setPasswordResetOpen(true);
  };

  const setPasswordResetOpenSafely = (open: boolean) => {
    if (isSendingResetCode || isResettingPassword) return;
    setPasswordResetOpen(open);
  };

  const sendResetCode = async () => {
    const email = resetEmail.trim().toLowerCase();
    if (!isRegistrationEmailValid(email)) return toast.error("请输入有效邮箱");
    if (enabled === false) return toast.error("平台尚未配置密码找回邮件，请联系管理员");
    setIsSendingResetCode(true);
    try {
      const result = await sendPasswordResetEmailCode(email);
      setResetEmail(email);
      setResetCodeCountdown(Math.max(1, Number(result.retry_after_seconds) || defaultResendSeconds));
      toast.success("验证码已发送", { description: "若该邮箱已注册，请检查收件箱和垃圾邮件。" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setIsSendingResetCode(false);
    }
  };

  const submitPasswordReset = async () => {
    const email = resetEmail.trim().toLowerCase();
    const emailCode = resetEmailCode.trim();
    if (!isRegistrationEmailValid(email)) return toast.error("请输入有效邮箱");
    if (emailCode.length !== codeLength) return toast.error(`请输入 ${codeLength} 位邮箱验证码`);
    if (resetNewPassword.length < 8) return toast.error("新密码至少 8 位");
    if (resetNewPassword !== resetConfirmPassword) return toast.error("两次输入的密码不一致");
    setIsResettingPassword(true);
    try {
      await resetPasswordByEmail(email, emailCode, resetNewPassword);
      setPasswordResetOpen(false);
      onSuccess(email);
      toast.success("密码已重置", { description: "请使用新密码登录。" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码重置失败");
    } finally {
      setIsResettingPassword(false);
    }
  };

  return {
    passwordResetOpen, resetEmail, resetEmailCode, resetNewPassword, resetConfirmPassword,
    resetCodeCountdown, isSendingResetCode, isResettingPassword,
    setPasswordResetOpen: setPasswordResetOpenSafely, setResetEmail, setResetEmailCode,
    setResetNewPassword, setResetConfirmPassword, openPasswordReset, sendResetCode, submitPasswordReset,
  };
}
