import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PENDING_STUDIO_PROMPT_STORAGE_KEY } from "@/app/landing/landing-brand";
import { useLoginRegistrationMode } from "@/app/login/use-login-registration-mode";
import { usePasswordReset } from "@/app/login/use-password-reset";
import { isRegistrationEmailValid, useRegistrationEmail } from "@/app/login/use-registration-email";
import { login, registerAccount } from "@/lib/api";
import { extractReturnToFromSearch } from "@/lib/request-unauthorized";
import { setVerifiedAuthSession } from "@/lib/session";
import { applyColorTheme, getPreferredColorTheme, saveColorTheme, type ColorTheme } from "@/lib/theme";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import {
  getAuthPersistPreference,
  getRememberedUsername,
  resolvePostAuthRoute,
  setRememberedUsername,
} from "@/store/auth";

export function useLoginPage() {
  const navigate = useNavigate();
  const mode = useLoginRegistrationMode();
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const [username, setUsernameState] = useState(() => getRememberedUsername());
  const [password, setPasswordState] = useState("");
  const [displayName, setDisplayNameState] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getAuthPersistPreference());
  const [agreedToTerms, setAgreedToTermsState] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const { isCheckingAuth } = useRedirectIfAuthenticated();
  const registrationEmail = useRegistrationEmail(mode.emailRegistrationEnabled, mode.emailCodeResendSeconds);
  const passwordReset = usePasswordReset(
    mode.passwordResetEnabled,
    mode.passwordResetCodeLength,
    mode.passwordResetResendSeconds,
    (email) => {
      setUsernameState(email);
      setPasswordState("");
      setErrorMessage(null);
    },
  );

  const setUsername = (value: string) => {
    if (errorMessage) setErrorMessage(null);
    setUsernameState(value);
  };
  const setPassword = (value: string) => {
    if (errorMessage) setErrorMessage(null);
    setPasswordState(value);
  };
  const setDisplayName = (value: string) => {
    if (errorMessage) setErrorMessage(null);
    setDisplayNameState(value);
  };
  const setEmail = (value: string) => {
    if (errorMessage) setErrorMessage(null);
    registrationEmail.setEmail(value);
  };
  const setEmailCode = (value: string) => {
    if (errorMessage) setErrorMessage(null);
    registrationEmail.setEmailCode(value);
  };
  const setAgreedToTerms = (value: boolean) => {
    if (errorMessage) setErrorMessage(null);
    setAgreedToTermsState(value);
  };

  const setRegisterMode = (next: boolean) => {
    mode.setRegisterMode(next);
    setShowPassword(false);
    setErrorMessage(null);
  };

  const reportValidationError = (message: string) => {
    setErrorMessage(message);
    toast.error(message);
  };

  const handleSubmit = async () => {
    const normalizedUsername = username.trim();
    const normalizedEmail = registrationEmail.email.trim().toLowerCase();
    const normalizedEmailCode = registrationEmail.emailCode.trim();
    const normalizedName = displayName.trim();
    if (mode.isRegisterMode) {
      if (!isRegistrationEmailValid(normalizedEmail)) return reportValidationError("请输入有效邮箱地址");
      if (mode.emailRegistrationEnabled === false) return reportValidationError("平台尚未配置注册邮件，请联系管理员");
      if (normalizedEmailCode.length !== mode.emailCodeLength) return reportValidationError(`请输入 ${mode.emailCodeLength} 位邮箱验证码`);
      if (password.length < 8) return reportValidationError("注册密码至少需要 8 位字符");
    } else if (!normalizedUsername) {
      return reportValidationError("请输入用户名或邮箱");
    }
    if (!password) return reportValidationError("请输入密码");
    if (mode.isRegisterMode && !agreedToTerms) return reportValidationError("请先阅读并勾选同意《用户服务协议与免责声明》");
    if (mode.isRegisterMode && mode.registrationEnabled === false) return reportValidationError("当前未开放注册");

    setErrorMessage(null);
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

      let pendingPrompt = (mode.searchParams.get("prompt") || "").trim();
      if (typeof window !== "undefined") {
        try {
          if (pendingPrompt) {
            window.sessionStorage.setItem(PENDING_STUDIO_PROMPT_STORAGE_KEY, pendingPrompt);
          } else {
            pendingPrompt = (window.sessionStorage.getItem(PENDING_STUDIO_PROMPT_STORAGE_KEY) || "").trim();
          }
        } catch {
          // Ignore storage restrictions.
        }
      }
      const returnTo = extractReturnToFromSearch(mode.searchParams);
      navigate(resolvePostAuthRoute(session, returnTo, pendingPrompt), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : mode.isRegisterMode ? "注册失败，请重试" : "登录失败，请检查账号或密码";
      setErrorMessage(message);
      toast.error(message);
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
    isSubmitting, errorMessage, theme, themeToggleRef, isCheckingAuth,
    ...mode, ...registrationEmail, ...passwordReset,
    setUsername, setPassword, setDisplayName, setEmail, setEmailCode,
    setShowPassword, setRememberMe, setAgreedToTerms, setTermsOpen,
    setIsRegisterMode: setRegisterMode, handleSubmit, handleThemeToggle,
  };
}

export type LoginPageState = ReturnType<typeof useLoginPage>;
