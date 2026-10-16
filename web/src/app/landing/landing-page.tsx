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
          isDark ? "bg-[#0c0a09]" : "bg-[#fff8f0]",
        )}
        role="status"
        aria-live="polite"
        aria-label="加载中"
      >
        <div className="relative">
          <div className={cn("size-10 animate-pulse rounded-full", isDark ? "bg-amber-500/30" : "bg-amber-300/40")} />
          <div className={cn("absolute inset-0 animate-ping rounded-full", isDark ? "bg-amber-400/20" : "bg-amber-200/30")} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-hidden font-login",
        isDark ? "bg-[#0c0a09] text-amber-50" : "bg-[#fff8f0] text-stone-800",
      )}
    >
      <a
        href="#hero-main"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70]",
          "focus:rounded-full focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-amber-400/60",
          isDark ? "focus:bg-amber-100 focus:text-stone-900" : "focus:bg-stone-900 focus:text-white",
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
