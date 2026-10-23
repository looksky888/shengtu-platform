import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MoonStar, Sun } from "lucide-react";

import { LANDING_BRAND } from "@/app/landing/landing-brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LandingHeaderProps {
  brandTitle: string;
  entered: boolean;
  isDark: boolean;
  onThemeToggle: () => void;
  registrationEnabled: boolean;
  themeToggleRef: RefObject<HTMLButtonElement | null>;
}

export function LandingHeader({
  brandTitle,
  entered,
  isDark,
  onThemeToggle,
  registrationEnabled,
  themeToggleRef,
}: LandingHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-20 border-b border-border/70 bg-background/80 backdrop-blur-md",
        "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        entered ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <div className="mx-auto flex h-15 w-full max-w-[1380px] items-center justify-between gap-3 px-4 sm:h-16 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <img
            src="/logo-mark.svg"
            alt=""
            aria-hidden="true"
            className="size-8 shrink-0 rounded-[10px] ring-1 ring-black/[0.08] sm:size-8.5 dark:ring-white/[0.14]"
          />
          <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
            {brandTitle}
          </span>
          <span className="hidden items-center rounded-md border border-border/80 bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground sm:inline-flex">
            {LANDING_BRAND.versionPill}
          </span>
        </div>

        <nav className="flex shrink-0 items-center gap-2" aria-label="工作台入口与主题切换">
          <Button
            ref={themeToggleRef}
            type="button"
            variant="outline"
            size="icon"
            className="relative size-8.5 rounded-lg border-border/80 bg-surface/85 text-muted-foreground shadow-none hover:border-border-strong hover:bg-surface-hover hover:text-foreground sm:size-9"
            onClick={onThemeToggle}
            aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
            title={isDark ? "浅色模式" : "深色模式"}
          >
            <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden="true" />
            <MoonStar className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden="true" />
          </Button>

          {registrationEnabled ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground sm:inline-flex"
            >
              <Link to="/login?register=1">注册账号</Link>
            </Button>
          ) : null}

          <Button
            asChild
            size="sm"
            className="h-8.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 sm:h-9 sm:px-4 sm:text-[13px]"
          >
            <Link to="/login">
              <span>登录工作台</span>
              <ArrowUpRight className="size-3.5 opacity-80" aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
