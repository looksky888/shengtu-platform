import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useLoginRegistrationMode } from "@/app/login/use-login-registration-mode";
import { usePasswordReset } from "@/app/login/use-password-reset";
import { isRegistrationEmailValid, useRegistrationEmail } from "@/app/login/use-registration-email";
import { login, registerAccount } from "@/lib/api";
import { setVerifiedAuthSession } from "@/lib/session";
import { applyColorTheme, getPreferredColorTheme, saveColorTheme, type ColorTheme } from "@/lib/theme";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import {
  getAuthPersistPreference,
  getDefaultRouteForSession,
  getRememberedUsername,
  setRememberedUsername,
} from "@/store/auth";

export function useLoginPage() {
  const navigate = useNavigate();
  const mode = useLoginRegistrationMode();
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const [username, setUsername] = useState(() => getRememberedUsername());
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getAuthPersistPreference());
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const { isCheckingAuth } = useRedirectIfAuthenticated();
  const registrationEmail = useRegistrationEmail(mode.emailRegistrationEnabled, mode.emailCodeResendSeconds);
  const passwordReset = usePasswordReset(
    mode.passwordResetEnabled,
    mode.passwordResetCodeLength,
    mode.passwordResetResendSeconds,
    (email) => {
      setUsername(email);
      setPassword("");
    },
  );

  const setRegisterMode = (next: boolean) => {
    mode.setRegisterMode(next);
    setShowPassword(false);
    setAgreedToTerms(false);
  };

  const handleSubmit = async () => {
    const normalizedUsername = username.trim();
    const normalizedEmail = registrationEmail.email.trim().toLowerCase();
    const normalizedEmailCode = registrationEmail.emailCode.trim();
    const normalizedName = displayName.trim();
    if (mode.isRegisterMode) {
      if (!isRegistrationEmailValid(normalizedEmail)) return toast.error("请输入有效邮箱");
      if (mode.emailRegistrationEnabled === false) return toast.error("平台尚未配置注册邮件，请联系管理员");
      if (normalizedEmailCode.length !== mode.emailCodeLength) return toast.error(`请输入 ${mode.emailCodeLength} 位邮箱验证码`);
      if (password.length < 8) return toast.error("注册密码至少 8 位");
    } else if (!normalizedUsername) {
      return toast.error("请输入用户名或邮箱");
    }
    if (!password) return toast.error("请输入密码");
    if (!agreedToTerms) return toast.error("请先阅读并勾选同意《用户协议与免责声明》");
    if (mode.isRegisterMode && mode.registrationEnabled === false) return toast.error("当前未开放注册");

    setIsSubmitting(true);
    try {
      const inviteCode = (mode.searchParams.get("invite_code") || mode.searchParams.get("invite") || "").trim() || undefined;
      const data = mode.isRegisterMode
        ? await registerAccount(normalizedEmail, normalizedEmailCode, password, normalizedName, { rememberMe, inviteCode })
        : await login(normalizedUsername, password, { rememberMe });
      const token = String(data.token || "").trim();
      if (!token) throw new Error("登录会话签发失败");
      const session = {
        key: token,
        role: data.role,
        roleId: data.role_id,
        roleName: data.role_name,
        subjectId: data.subject_id,
        name: data.name,
        provider: data.provider,
        menuPaths: data.menu_paths || [],
        apiPermissions: data.api_permissions || [],
        menus: data.menus || [],
      };
      await setVerifiedAuthSession(session, { rememberMe });
      setRememberedUsername(rememberMe ? (mode.isRegisterMode ? normalizedEmail : normalizedUsername) : "");
      toast.success(mode.isRegisterMode ? "注册成功" : "登录成功");
      navigate(getDefaultRouteForSession(session), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : mode.isRegisterMode ? "注册失败" : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rect = themeToggleRef.current?.getBoundingClientRect();
    applyColorTheme(nextTheme, rect
      ? { origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, force: true }
      : { force: true });
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  return {
    username, password, displayName, showPassword, rememberMe, agreedToTerms, termsOpen,
    isSubmitting, theme, themeToggleRef, isCheckingAuth,
    ...mode, ...registrationEmail, ...passwordReset,
    setUsername, setPassword, setDisplayName, setShowPassword, setRememberMe,
    setAgreedToTerms, setTermsOpen, setIsRegisterMode: setRegisterMode,
    handleSubmit, handleThemeToggle,
  };
}

export type LoginPageState = ReturnType<typeof useLoginPage>;
