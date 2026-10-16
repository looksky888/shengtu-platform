import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { MoonStar, Sun } from "lucide-react";

import { LANDING_BRAND } from "@/app/landing/landing-brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LandingHeaderProps {
  entered: boolean;
  isDark: boolean;
  onThemeToggle: () => void;
  registrationEnabled: boolean;
  themeToggleRef: RefObject<HTMLButtonElement | null>;
}

export function LandingHeader({
  entered,
  isDark,
  onThemeToggle,
  registrationEnabled,
  themeToggleRef,
}: LandingHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4",
        "transition-all duration-700 ease-out",
        entered ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <img
          src="/logo-mark.svg"
          alt=""
          aria-hidden="true"
          className="size-8 shrink-0 rounded-[14px] shadow-[0_10px_24px_rgba(180,83,9,0.18)] sm:size-9 sm:rounded-2xl"
        />
        <div className="min-w-0 leading-tight">
          <div
            className={cn(
              "truncate text-sm font-semibold tracking-tight",
              isDark ? "text-amber-50" : "text-stone-800",
            )}
          >
            {LANDING_BRAND.name}
          </div>
          <div
            className={cn(
              "hidden text-[10px] font-medium uppercase tracking-[0.22em] sm:block",
              isDark ? "text-amber-100/40" : "text-stone-400",
            )}
          >
            {LANDING_BRAND.badge}
          </div>
        </div>
      </div>

      <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="账户与主题">
        <Button
          ref={themeToggleRef}
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "relative size-9 rounded-full shadow-sm backdrop-blur",
            isDark
              ? "border-amber-800/50 bg-stone-900/70 hover:border-amber-700 hover:bg-stone-900"
              : "border-amber-200/80 bg-white/75 hover:border-amber-300 hover:bg-white",
          )}
          onClick={onThemeToggle}
          aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
          title={isDark ? "浅色模式" : "深色模式"}
        >
          <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true" />
          <MoonStar className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true" />
        </Button>
        {registrationEnabled ? (
          <Link
            to="/login?register=1"
            className={cn(
              "hidden rounded-full px-3 py-1.5 text-sm font-medium transition sm:inline-flex",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
              isDark
                ? "text-amber-100/60 hover:bg-white/5 hover:text-amber-50"
                : "text-stone-500 hover:bg-white/60 hover:text-amber-900",
            )}
          >
            注册
          </Link>
        ) : null}
        <Link
          to="/login"
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold shadow-[0_8px_20px_rgba(180,83,9,0.08)] backdrop-blur-md transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
            isDark
              ? "border-amber-700/50 bg-amber-950/50 text-amber-50 hover:border-amber-600 hover:bg-amber-900/40"
              : "border-amber-200/80 bg-white/75 text-stone-800 hover:border-amber-300 hover:bg-white hover:text-amber-900",
          )}
        >
          登录
        </Link>
      </nav>
    </header>
  );
}
