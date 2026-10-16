import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

import { LANDING_BRAND } from "@/app/landing/landing-brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LandingCTAProps {
  ctaRef: RefObject<HTMLElement | null>;
  entered: boolean;
  isDark: boolean;
  registrationEnabled: boolean;
}

export function LandingCTA({ ctaRef, entered, isDark, registrationEnabled }: LandingCTAProps) {
  return (
    <main
      id="hero-main"
      ref={ctaRef}
      tabIndex={-1}
      className={cn(
        "relative z-10 flex h-[calc(100%-4.5rem)] flex-col items-center justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] will-change-transform sm:px-6 sm:pb-16",
        "transition-all duration-700 delay-150 ease-out outline-none",
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-lg rounded-[28px] border px-5 py-6 backdrop-blur-xl sm:px-8 sm:py-7",
          isDark
            ? "border-amber-900/40 bg-stone-950/55 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            : "border-white/70 bg-white/55 shadow-[0_20px_60px_rgba(120,53,15,0.08),0_4px_16px_rgba(28,25,23,0.04)]",
        )}
      >
        <div className="flex flex-col items-center gap-3.5 text-center sm:gap-4">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
              isDark
                ? "border-amber-800/50 bg-amber-950/50 text-amber-100/80"
                : "border-amber-200/90 bg-amber-50/80 text-amber-900/80",
            )}
          >
            <Sparkles className="size-3.5 text-amber-500" aria-hidden="true" />
            {LANDING_BRAND.badge}
          </div>

          <div className="flex flex-col gap-2">
            <h1
              className={cn(
                "text-balance text-[1.65rem] font-semibold tracking-[-0.03em] sm:text-3xl",
                isDark ? "text-amber-50" : "text-stone-900",
              )}
            >
              {LANDING_BRAND.headline}
            </h1>
            <p
              className={cn(
                "mx-auto max-w-sm text-pretty text-sm leading-6 sm:text-[0.95rem]",
                isDark ? "text-amber-100/55" : "text-stone-500",
              )}
            >
              {LANDING_BRAND.tagline}
            </p>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-2 pt-0.5" aria-label="能力亮点">
            {LANDING_BRAND.channels.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm",
                  isDark
                    ? "border-amber-900/45 bg-stone-900/70 text-amber-100/70"
                    : "border-stone-200/80 bg-white/80 text-stone-600",
                )}
              >
                <Icon className="size-3 text-amber-500" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>

          <div className="flex w-full flex-col items-stretch justify-center gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-center">
            <Button
              asChild
              className={cn(
                "h-11 rounded-full px-6 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-amber-400/50",
                isDark
                  ? "bg-amber-100 text-stone-900 shadow-[0_14px_36px_rgba(0,0,0,0.35)] hover:bg-amber-50"
                  : "bg-stone-900 text-white shadow-[0_14px_36px_rgba(28,25,23,0.22)] hover:bg-stone-800",
              )}
            >
              <Link to="/login">
                进入控制台
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Link>
            </Button>
            {registrationEnabled ? (
              <Button
                asChild
                variant="outline"
                className={cn(
                  "h-11 rounded-full px-6 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-amber-400/50",
                  isDark
                    ? "border-amber-800/50 bg-stone-900/50 text-amber-50 hover:border-amber-700 hover:bg-stone-900"
                    : "border-amber-200/90 bg-white/70 text-stone-700 hover:border-amber-300 hover:bg-white",
                )}
              >
                <Link to="/login?register=1">创建账号</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <p
        className={cn(
          "mt-4 text-center text-[11px] tracking-wide",
          isDark ? "text-amber-100/35" : "text-stone-400/90",
        )}
      >
        {LANDING_BRAND.footer}
      </p>
    </main>
  );
}
