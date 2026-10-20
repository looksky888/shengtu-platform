import * as React from "react";
import {
  BookOpen,
  ChevronDown,
  Coins,
  ExternalLink,
  LayoutGrid,
  LogOut,
  MoonStar,
  ShieldCheck,
  Sun,
  UserCircle2,
} from "lucide-react";
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
  getNavItemIcon,
  groupNavItems,
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
      <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <MoonStar className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
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
  const Icon = getNavItemIcon(item);

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        onClick={onClick}
        aria-label={`${item.label}（新标签页打开）`}
        className="relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Icon className="size-3.5 text-brand" />
        <span>{item.label}</span>
        <ExternalLink className="size-3 opacity-60" />
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
          "relative isolate inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors",
          active
            ? "text-brand dark:text-brand"
            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        )
      }
    >
      {active ? (
        <motion.span
          layoutId={NAV_ACTIVE_LAYOUT_ID}
          transition={
            prefersReducedMotion ? reducedNavActiveTransition : navActiveTransition
          }
          className="absolute inset-0 -z-10 rounded-lg border border-brand-border bg-brand-soft"
        />
      ) : null}
      <Icon
        className={cn(
          "relative z-10 size-3.5 shrink-0 transition-colors",
          active ? "text-brand" : "text-muted-foreground/85"
        )}
      />
      <span className="relative z-10 block">{item.label}</span>
    </NavLink>
  );
}

export function CreditBalanceBadge({
  creditBalance,
  canRecharge = false,
}: {
  creditBalance: string;
  canRecharge?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "inline-flex h-8 min-w-[84px] items-center justify-center gap-1.5 rounded-full border border-border/80 bg-surface-muted/75 px-3 text-xs font-medium text-foreground transition-colors",
        canRecharge && "hover:border-brand-border hover:bg-brand-soft hover:text-brand"
      )}
      title={canRecharge ? "当前积分余额，点击前往充值中心" : "当前积分余额"}
    >
      <Coins className="size-3.5 text-amber-500" />
      <span className="text-muted-foreground">积分</span>
      <span className="font-mono font-semibold tabular-nums">{creditBalance}</span>
    </div>
  );

  if (canRecharge) {
    return <Link to="/recharge">{content}</Link>;
  }
  return content;
}

export function MoreNavMenu({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  const [open, setOpen] = React.useState(false);

  if (items.length === 0) return null;
  const activeItem = items.find((item) => isActivePath(pathname, item.href));
  const active = Boolean(activeItem);
  const grouped = groupNavItems(items);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-[13px] font-medium",
            active
              ? "border border-brand-border bg-brand-soft text-brand"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <LayoutGrid className="size-3.5" />
          <span>{activeItem ? activeItem.label : "管理与运维"}</span>
          <ChevronDown className="size-3.5 opacity-75" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(32rem,calc(100vw-1.5rem))] rounded-2xl p-3"
      >
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <div className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground/80">
                {group.label}
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = getNavItemIcon(item);
                  const itemActive = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onMouseEnter={() => preloadRoute(item.href)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                        itemActive
                          ? "bg-brand-soft text-brand"
                          : "text-foreground hover:bg-surface-hover"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                          itemActive
                            ? "border-brand-border bg-surface text-brand"
                            : "border-border/70 bg-surface-muted text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-[13px] font-medium">
                            {item.label}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            {item.href}
                          </span>
                        </div>
                        {item.description ? (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
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
  const [open, setOpen] = React.useState(false);
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
            compact ? "size-8 px-0" : "h-8 gap-1.5 px-2",
            profileActive && "border-brand-border bg-brand-soft text-brand"
          )}
          aria-label="账号菜单"
        >
          <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
            {initial}
          </span>
          <span className="hidden max-w-[110px] truncate text-xs font-medium xl:inline">
            {displayName}
          </span>
          <ChevronDown className={cn("size-3.5 opacity-70", compact && "hidden")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-2xl p-2.5"
      >
        <div className="flex flex-col gap-2">
          <AccountSummary
            session={session}
            roleLabel={roleLabel}
            displayName={displayName}
            initial={initial}
            creditBalance={creditBalance}
          />
          <div className="grid gap-1 border-t border-border/60 pt-1.5">
            <Link
              to={profileNavItem.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition hover:bg-surface-hover",
                profileActive ? "bg-brand-soft text-brand" : "text-foreground"
              )}
            >
              <UserCircle2 className="size-4 text-muted-foreground" />
              <span>个人中心 · 账号概览</span>
            </Link>
            <Link
              to="/profile?tab=api"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-hover"
            >
              <BookOpen className="size-4 text-brand" />
              <span>接口密钥与 API 文档</span>
            </Link>
            <Link
              to="/profile?tab=credits"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-hover"
            >
              <Coins className="size-4 text-amber-500" />
              <span>积分中心与流水</span>
            </Link>
            {session.role === "admin" ? (
              <Link
                to="/rbac"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-hover"
              >
                <ShieldCheck className="size-4 text-muted-foreground" />
                <span>角色与权限</span>
              </Link>
            ) : null}
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
            >
              <LogOut className="size-4" />
              <span>退出登录</span>
            </button>
          </div>
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
      <div className="rounded-xl bg-surface-muted/80 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </div>
            <code className="block truncate font-mono text-[11px] text-muted-foreground">
              {session.subjectId || session.role}
            </code>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <AccountMetric label="角色" value={roleLabel} />
        <AccountMetric label="积分" value={creditBalance} />
        <AccountMetric label="版本" value={`v${webConfig.appVersion}`} />
      </div>
    </>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted/55 px-2.5 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}
