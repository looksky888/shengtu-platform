"use client";

import { LoaderCircle } from "lucide-react";

import { LandingBackground } from "@/app/landing/landing-background";
import { LandingCTA } from "@/app/landing/landing-cta";
import { LandingHeader } from "@/app/landing/landing-header";
import { useLandingPage } from "@/app/landing/use-landing-page";

/** Full-screen pre-login editorial studio showcase. */
export function LandingPage() {
  const {
    brandTitle,
    checking,
    entered,
    handleThemeToggle,
    isDark,
    prefersReducedMotion,
    registrationEnabled,
    themeToggleRef,
  } = useLandingPage();

  if (checking) {
    return (
      <div
        className="studio-grid-bg fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground"
        role="status"
        aria-live="polite"
        aria-label="正在加载工作台"
      >
        <div className="flex items-center gap-2.5 rounded-full border border-border/80 bg-surface/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-2xs">
          <LoaderCircle className="size-3.5 animate-spin text-foreground" aria-hidden="true" />
          <span>正在准备创作空间…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-x-hidden overflow-y-auto bg-background font-sans text-foreground">
      <a
        href="#hero-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md focus:outline-none"
      >
        跳到主要内容
      </a>

      <LandingBackground isDark={isDark} />

      <LandingHeader
        brandTitle={brandTitle}
        entered={entered}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
        registrationEnabled={registrationEnabled}
        themeToggleRef={themeToggleRef}
      />

      <LandingCTA
        brandTitle={brandTitle}
        entered={entered}
        prefersReducedMotion={prefersReducedMotion}
        registrationEnabled={registrationEnabled}
      />
    </div>
  );
}

export default LandingPage;
