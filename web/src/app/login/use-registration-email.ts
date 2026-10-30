import { useState } from "react";
import { toast } from "sonner";

import { usePersistedCountdown } from "@/app/login/use-persisted-countdown";
import { sendRegistrationEmailCode } from "@/lib/api";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGISTER_OTP_COUNTDOWN_KEY = "shengtu:otp-countdown:register";

export function isRegistrationEmailValid(email: string) {
  return emailPattern.test(email.trim());
}

export function useRegistrationEmail(enabled: boolean | null, defaultResendSeconds: number) {
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [emailCodeCountdown, startEmailCodeCountdown] = usePersistedCountdown(REGISTER_OTP_COUNTDOWN_KEY);

  const sendEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isRegistrationEmailValid(normalizedEmail)) {
      toast.error("请输入有效邮箱");
      return;
    }
    if (enabled === false) {
      toast.error("平台尚未配置注册邮件，请联系管理员");
      return;
    }
    setIsSendingEmailCode(true);
    try {
      const result = await sendRegistrationEmailCode(normalizedEmail);
      setEmail(normalizedEmail);
      startEmailCodeCountdown(Math.max(1, Number(result.retry_after_seconds) || defaultResendSeconds));
      toast.success("验证码已发送", { description: "请检查收件箱和垃圾邮件。" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  return {
    email, emailCode, isSendingEmailCode, emailCodeCountdown,
    setEmail, setEmailCode, sendEmailCode,
  };
}
