"use client";

import { LandingBackground } from "@/app/landing/landing-background";
import { LandingCTA } from "@/app/landing/landing-cta";
import { LandingHeader } from "@/app/landing/landing-header";
import { useLandingPage } from "@/app/landing/use-landing-page";
import { cn } from "@/lib/utils";

/** Full-screen pre-login brand hero. */
export function LandingPage() {
  const {
    bgShiftRef,
    checking,
    ctaRef,
    entered,
    handleThemeToggle,
    isDark,
    parallaxRef,
    prefersReducedMotion,
    registrationEnabled,
    themeToggleRef,
    watermarkRef,
  } = useLandingPage();

  if (checking) {
    return (
      <div
        className={cn(
          "fixed inset-0 flex items-center justify-center",
          isDark ? "bg-[#090b10]" : "bg-[#f8fafc]",
        )}
        role="status"
        aria-live="polite"
        aria-label="加载中"
      >
        <div className="relative">
          <div className={cn("size-10 animate-pulse rounded-full", isDark ? "bg-blue-500/30" : "bg-blue-400/35")} />
          <div className={cn("absolute inset-0 animate-ping rounded-full", isDark ? "bg-blue-400/20" : "bg-blue-300/25")} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-hidden font-login",
        isDark ? "bg-[#090b10] text-slate-50" : "bg-[#f8fafc] text-slate-900",
      )}
    >
      <a
        href="#hero-main"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70]",
          "focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
          isDark ? "focus:bg-slate-100 focus:text-slate-900" : "focus:bg-slate-900 focus:text-white",
        )}
      >
        跳到主要内容
      </a>

      <LandingBackground
        bgShiftRef={bgShiftRef}
        entered={entered}
        isDark={isDark}
        parallaxRef={parallaxRef}
        prefersReducedMotion={prefersReducedMotion}
        watermarkRef={watermarkRef}
      />
      <LandingHeader
        entered={entered}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
        registrationEnabled={registrationEnabled}
        themeToggleRef={themeToggleRef}
      />
      <LandingCTA
        ctaRef={ctaRef}
        entered={entered}
        isDark={isDark}
        registrationEnabled={registrationEnabled}
      />
    </div>
  );
}

export default LandingPage;
