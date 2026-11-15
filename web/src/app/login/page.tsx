"use client";

import { useEffect, useState } from "react";

import { LoginFormPanel } from "@/app/login/login-form-panel";
import { LoginLoadingScreen } from "@/app/login/login-loading-screen";
import { LoginTopActions } from "@/app/login/login-top-actions";
import { loginBackgroundClass, loginCardClass } from "@/app/login/login-utils";
import { LoginVisualPanel } from "@/app/login/login-visual-panel";
import { useLoginPage } from "@/app/login/use-login-page";
import { BannerAnnouncementsBar } from "@/components/banner-announcements-bar";
import { useAppMeta } from "@/lib/use-app-meta";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const appMeta = useAppMeta();
  const state = useLoginPage();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (state.isCheckingAuth) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [state.isCheckingAuth]);

  if (state.isCheckingAuth) return <LoginLoadingScreen />;

  const modeLabel = state.isRegisterMode ? "注册" : "登录";

  return (
    <div
      className={`${loginBackgroundClass} fixed inset-0 z-50 flex h-svh w-screen flex-col overflow-hidden p-0 font-login`}
    >
      <BannerAnnouncementsBar target="login" className="shrink-0" />

      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#1456f0] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none"
      >
        跳到{modeLabel}表单
      </a>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <LoginTopActions state={state} />

        <div className="my-auto flex w-full justify-center">
          <div
            className={cn(
              loginCardClass,
              "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
            role="main"
            aria-label={modeLabel}
          >
            <LoginFormPanel appMeta={appMeta} state={state} />
            <LoginVisualPanel appMeta={appMeta} isRegisterMode={state.isRegisterMode} />
          </div>
        </div>
      </div>
    </div>
  );
}
