import { useState } from "react";
import { ChevronDown, LogOut, MoonStar, Sun, UserCircle2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Link, NavLink } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import webConfig from "@/constants/common-env";
import type { ColorTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

import {
  isActivePath,
  NAV_ACTIVE_LAYOUT_ID,
  navActiveTransition,
  profileNavItem,
  reducedNavActiveTransition,
  type NavItem,
} from "./top-nav-config";

export function ThemeToggleButton({
  theme,
  onToggle,
  className,
}: {
  theme: ColorTheme;
  onToggle: (button: HTMLButtonElement) => void;
  className?: string;
}) {
  const dark = theme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative size-8 rounded-full", className)}
      onClick={(event) => onToggle(event.currentTarget)}
      aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
      title={dark ? "浅色模式" : "深色模式"}
    >
      <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <MoonStar className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">切换界面主题</span>
    </Button>
  );
}

export function NavPill({
  item,
  pathname,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  const prefersReducedMotion = useReducedMotion();

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        onClick={onClick}
        aria-label={`${item.label}（新标签页打开）`}
        className="relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-[#45515e] transition-colors hover:bg-black/[0.05] hover:text-[#18181b] sm:text-sm dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
      >
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.href}
      onClick={onClick}
      onMouseEnter={() => preloadRoute(item.href)}
      onFocus={() => preloadRoute(item.href)}
      className={() =>
        cn(
          "relative isolate shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:text-sm",
          active
            ? "text-[#18181b] dark:text-accent-foreground"
            : "text-[#45515e] hover:bg-black/[0.05] hover:text-[#18181b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
        )
      }
    >
      {active ? (
        <motion.span
          layoutId={NAV_ACTIVE_LAYOUT_ID}
          transition={prefersReducedMotion ? reducedNavActiveTransition : navActiveTransition}
          className="absolute inset-0 -z-10 rounded-full bg-black/[0.06] shadow-[inset_0_0_0_1px_rgba(20,86,240,0.08)] dark:bg-accent"
        />
      ) : null}
      <motion.span
        animate={{ scale: active && !prefersReducedMotion ? 1.03 : 1 }}
        transition={
          prefersReducedMotion
            ? reducedNavActiveTransition
            : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
        }
        className="relative z-10 block"
      >
        {item.label}
      </motion.span>
    </NavLink>
  );
}

export function CreditBalanceBadge({ creditBalance }: { creditBalance: string }) {
  return (
    <div className="flex min-w-[84px] items-center justify-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground tabular-nums">
      积分 {creditBalance}
    </div>
  );
}

export function MoreNavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const active = items.some((item) => isActivePath(pathname, item.href));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium",
            active
              ? "bg-black/[0.06] text-[#18181b] dark:bg-accent dark:text-accent-foreground"
              : "text-[#45515e] hover:bg-black/[0.05] hover:text-[#18181b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
          )}
        >
          更多 <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-44 p-1">
        <div className="grid gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onMouseEnter={() => preloadRoute(item.href)}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground",
                isActivePath(pathname, item.href)
                  ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                  : "text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AccountMenu({
  session,
  roleLabel,
  creditBalance,
  pathname,
  onLogout,
  compact = false,
}: {
  session: StoredAuthSession;
  roleLabel: string;
  creditBalance: string;
  pathname: string;
  onLogout: () => Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const displayName = session.name || roleLabel;
  const initial = (displayName.trim() || "U").slice(0, 1).toUpperCase();
  const profileActive = isActivePath(pathname, profileNavItem.href);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "rounded-full shadow-none",
            compact ? "size-8 px-0" : "h-9 px-2.5",
            profileActive
              ? "border-[#1456f0]/30 bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
              : "",
          )}
          aria-label="账号菜单"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#181e25] text-xs font-semibold text-white dark:bg-foreground dark:text-background">
            {initial}
          </span>
          <span className="hidden max-w-[120px] truncate lg:inline">{displayName}</span>
          <ChevronDown className={compact ? "hidden" : undefined} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 border-border bg-card p-2 text-card-foreground shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)] dark:border-border dark:bg-card"
      >
        <div className="flex flex-col gap-2">
          <AccountSummary
            session={session}
            roleLabel={roleLabel}
            displayName={displayName}
            initial={initial}
            creditBalance={creditBalance}
          />
          <Link
            to={profileNavItem.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground",
              profileActive
                ? "bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                : "text-foreground",
            )}
          >
            <UserCircle2 className="size-4" />
            个人中心
          </Link>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            <LogOut className="size-4" />
            退出登录
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountSummary({
  session,
  roleLabel,
  displayName,
  initial,
  creditBalance,
}: {
  session: StoredAuthSession;
  roleLabel: string;
  displayName: string;
  initial: string;
  creditBalance: string;
}) {
  return (
    <>
      <div className="rounded-xl bg-muted/50 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#181e25] text-sm font-semibold text-white dark:bg-foreground dark:text-background">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
            <code className="block truncate font-mono text-xs text-muted-foreground">
              {session.subjectId || session.role}
            </code>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <AccountMetric label="角色" value={roleLabel} />
        <AccountMetric label="积分" value={creditBalance} />
        <AccountMetric label="版本" value={`v${webConfig.appVersion}`} />
      </div>
    </>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="truncate font-medium text-foreground">{value}</div>
    </div>
  );
}
