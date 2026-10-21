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
          className="size-8 shrink-0 rounded-lg shadow-2xs sm:size-9 sm:rounded-xl"
        />
        <div className="min-w-0 leading-tight">
          <div
            className={cn(
              "truncate text-sm font-semibold tracking-tight",
              isDark ? "text-slate-100" : "text-slate-900",
            )}
          >
            {LANDING_BRAND.name}
          </div>
          <div
            className={cn(
              "hidden text-[10px] font-medium uppercase tracking-[0.18em] sm:block",
              isDark ? "text-slate-400" : "text-slate-500",
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
            "relative size-9 rounded-lg shadow-2xs backdrop-blur",
            isDark
              ? "border-white/10 bg-slate-900/70 hover:border-white/20 hover:bg-slate-900"
              : "border-slate-200/80 bg-white/80 hover:border-slate-300 hover:bg-white",
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
              "hidden rounded-lg px-3 py-1.5 text-sm font-medium transition sm:inline-flex",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              isDark
                ? "text-slate-300 hover:bg-white/5 hover:text-white"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
            )}
          >
            注册
          </Link>
        ) : null}
        <Link
          to="/login"
          className={cn(
            "inline-flex h-9 items-center rounded-lg border px-4 text-sm font-semibold shadow-2xs backdrop-blur-md transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isDark
              ? "border-blue-500/40 bg-blue-600 text-white hover:bg-blue-500"
              : "border-[#1456f0] bg-[#1456f0] text-white hover:bg-[#0f49cf]",
          )}
        >
          登录
        </Link>
      </nav>
    </header>
  );
}
