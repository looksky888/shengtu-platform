import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { fetchAuthProviders } from "@/lib/api";

function wantsRegisterFromSearch(params: URLSearchParams) {
  const raw = (params.get("register") || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function useLoginRegistrationMode() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [emailRegistrationEnabled, setEmailRegistrationEnabled] = useState<boolean | null>(null);
  const [emailCodeLength, setEmailCodeLength] = useState(6);
  const [emailCodeResendSeconds, setEmailCodeResendSeconds] = useState(60);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState<boolean | null>(null);
  const [passwordResetCodeLength, setPasswordResetCodeLength] = useState(6);
  const [passwordResetResendSeconds, setPasswordResetResendSeconds] = useState(60);
  const [isRegisterMode, setIsRegisterMode] = useState(() => wantsRegisterFromSearch(searchParams));
  const isRegisterModeRef = useRef(isRegisterMode);
  const userPickedModeRef = useRef(false);
  const notifiedRegDisabledRef = useRef(false);
  isRegisterModeRef.current = isRegisterMode;

  useEffect(() => {
    if (userPickedModeRef.current) {
      userPickedModeRef.current = false;
      return;
    }
    const wantsRegister = wantsRegisterFromSearch(searchParams);
    if (wantsRegister !== isRegisterModeRef.current) {
      isRegisterModeRef.current = wantsRegister;
      setIsRegisterMode(wantsRegister);
    }
  }, [searchParams]);

  useEffect(() => {
    document.title = isRegisterMode ? "创建账号 · 登录" : "登录 · 控制台";
  }, [isRegisterMode]);

  useEffect(() => {
    let active = true;
    void fetchAuthProviders()
      .then((providers) => {
        if (!active) return;
        const registration = providers.registration;
        const regEnabled = Boolean(registration?.enabled);
        setRegistrationEnabled(regEnabled);
        setEmailRegistrationEnabled(Boolean(registration?.email?.enabled));
        setEmailCodeLength(Math.max(1, Number(registration?.email?.code_length) || 6));
        setEmailCodeResendSeconds(Math.max(1, Number(registration?.email?.resend_after_seconds) || 60));
        setPasswordResetEnabled(Boolean(providers.password_reset?.enabled));
        setPasswordResetCodeLength(Math.max(1, Number(providers.password_reset?.code_length) || 6));
        setPasswordResetResendSeconds(Math.max(1, Number(providers.password_reset?.resend_after_seconds) || 60));
        if (!regEnabled && isRegisterModeRef.current) {
          isRegisterModeRef.current = false;
          setIsRegisterMode(false);
          const next = new URLSearchParams(window.location.search);
          next.delete("register");
          setSearchParams(next, { replace: true });
          if (!notifiedRegDisabledRef.current) {
            notifiedRegDisabledRef.current = true;
            toast.message("当前未开放注册", { description: "请联系管理员在设置中开启用户注册。" });
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setRegistrationEnabled((value) => value ?? false);
        setEmailRegistrationEnabled((value) => value ?? false);
        setPasswordResetEnabled((value) => value ?? false);
      });
    return () => { active = false; };
  }, [setSearchParams]);

  const setRegisterMode = useCallback((next: boolean) => {
    if (next === isRegisterModeRef.current) return;
    if (next && registrationEnabled === false) {
      toast.error("当前未开放注册", { description: "请联系管理员在设置中开启用户注册。" });
      return;
    }
    userPickedModeRef.current = true;
    isRegisterModeRef.current = next;
    setIsRegisterMode(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("register", "1");
    else params.delete("register");
    setSearchParams(params, { replace: true });
  }, [registrationEnabled, setSearchParams]);

  return {
    searchParams, isRegisterMode, registrationEnabled, emailRegistrationEnabled,
    emailCodeLength, emailCodeResendSeconds, passwordResetEnabled,
    passwordResetCodeLength, passwordResetResendSeconds, setRegisterMode,
  };
}
