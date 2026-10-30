"use client";

import { useEffect, useState } from "react";

import { LoginFormPanel } from "@/app/login/login-form-panel";
import { LoginLoadingScreen } from "@/app/login/login-loading-screen";
import { LoginTopActions } from "@/app/login/login-top-actions";
import { loginBackgroundClass, loginCardClass } from "@/app/login/login-utils";
import { LoginMobileVisualBanner, LoginVisualPanel } from "@/app/login/login-visual-panel";
import { useLoginPage } from "@/app/login/use-login-page";
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

  const modeLabel = state.isRegisterMode ? "注册账号" : "账号登录";

  return (
    <div
      className={`${loginBackgroundClass} fixed inset-0 z-50 flex min-h-svh w-screen flex-col overflow-y-auto px-4 py-4 font-login sm:px-6 sm:py-6 lg:px-8`}
    >
      {/* Subtle radial vignette softening the perimeter of the 32px hairline grid */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_38%,var(--background)_100%)]"
        aria-hidden="true"
      />

      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-none"
      >
        跳到{modeLabel}表单
      </a>

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
          <LoginMobileVisualBanner appMeta={appMeta} />
          <LoginVisualPanel appMeta={appMeta} isRegisterMode={state.isRegisterMode} />
          <LoginFormPanel appMeta={appMeta} state={state} />
        </div>
      </div>
    </div>
  );
}
