import * as React from "react";
import {
  ArrowUpRight,
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
  isNavItemActive,
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
      className={cn(
        "relative size-8 rounded-lg text-muted-foreground shadow-none hover:bg-surface-hover hover:text-foreground",
        className
      )}
      onClick={(event) => onToggle(event.currentTarget)}
      aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
      title={dark ? "浅色模式" : "深色模式"}
    >
      <Sun className="size-3.5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <MoonStar className="absolute size-3.5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
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
  const active = isNavItemActive(pathname, item);
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
        className="relative inline-flex h-7.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon className="size-3.5 text-muted-foreground" />
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
          "relative isolate inline-flex h-7.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-medium transition-colors",
          active
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )
      }
    >
      {active ? (
        <motion.span
          layoutId={NAV_ACTIVE_LAYOUT_ID}
          transition={
            prefersReducedMotion ? reducedNavActiveTransition : navActiveTransition
          }
          className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-xs ring-1 ring-black/[0.04] dark:bg-zinc-800/95 dark:ring-white/[0.08]"
        />
      ) : null}
      <Icon
        className={cn(
          "relative z-10 size-3.5 shrink-0 transition-colors",
          active ? "text-foreground" : "text-muted-foreground/85"
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
        "inline-flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-lg bg-surface-muted/85 px-2.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border/75 transition-all duration-150",
        canRecharge && "hover:-translate-y-px hover:bg-surface hover:shadow-2xs hover:ring-border-strong"
      )}
      title={canRecharge ? "当前算力积分余额，点击前往充值中心" : "当前算力积分余额"}
    >
      <Coins className="size-3.5 text-foreground/70" />
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
  const prefersReducedMotion = useReducedMotion();

  if (items.length === 0) return null;
  const activeItem = items.find((item) => isActivePath(pathname, item.href));
  const active = Boolean(activeItem);
  const grouped = groupNavItems(items);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative isolate inline-flex h-7.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            active
              ? "font-semibold text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {active ? (
            <motion.span
              layoutId={NAV_ACTIVE_LAYOUT_ID}
              transition={
                prefersReducedMotion ? reducedNavActiveTransition : navActiveTransition
              }
              className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-xs ring-1 ring-black/[0.04] dark:bg-zinc-800/95 dark:ring-white/[0.08]"
            />
          ) : null}
          <LayoutGrid
            className={cn(
              "relative z-10 size-3.5 shrink-0 transition-colors",
              active ? "text-foreground" : "text-muted-foreground/85"
            )}
          />
          <span className="relative z-10 inline-flex items-center gap-1.5">
            <span>管理控制台</span>
            {activeItem ? (
              <span className="text-muted-foreground lg:hidden">
                · {activeItem.label}
              </span>
            ) : null}
            {active ? (
              <span
                aria-hidden="true"
                className="hidden size-1.5 rounded-full bg-foreground lg:inline-block"
              />
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "relative z-10 size-3.5 opacity-65 transition-transform duration-150",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[min(33rem,calc(100vw-1.5rem))] rounded-2xl border-border/85 bg-surface-raised p-3 shadow-xl"
      >
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <div className="px-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/80">
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
                          ? "bg-surface-muted text-foreground"
                          : "text-foreground hover:bg-surface-hover"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-7.5 shrink-0 items-center justify-center rounded-lg border transition-colors",
                          itemActive
                            ? "border-foreground/20 bg-foreground text-background shadow-2xs"
                            : "border-border/75 bg-surface-subtle text-muted-foreground group-hover:bg-surface group-hover:text-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-[13px] font-medium">
                            {item.label}
                          </span>
                          {itemActive ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
                          ) : null}
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
  canRecharge = false,
  pathname,
  onLogout,
  compact = false,
}: {
  session: StoredAuthSession;
  roleLabel: string;
  creditBalance: string;
  canRecharge?: boolean;
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
          variant="ghost"
          className={cn(
            "rounded-lg shadow-none hover:bg-surface-hover",
            compact ? "size-8 px-0" : "h-8 gap-1.5 px-1.5",
            profileActive && "bg-surface-muted text-foreground"
          )}
          aria-label="账号菜单"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-[11px] font-semibold text-background shadow-2xs">
            {initial}
          </span>
          <span className="hidden max-w-[96px] truncate text-xs font-medium xl:inline">
            {displayName}
          </span>
          <ChevronDown className={cn("size-3.5 opacity-60", compact && "hidden")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[296px] rounded-2xl border-border/85 bg-surface-raised p-3 shadow-xl"
      >
        <div className="flex flex-col gap-2.5">
          <AccountSummary
            session={session}
            roleLabel={roleLabel}
            displayName={displayName}
            initial={initial}
            creditBalance={creditBalance}
            canRecharge={canRecharge}
            onClose={() => setOpen(false)}
          />
          <div className="grid gap-0.5 pt-0.5">
            <AccountActionLink
              to={profileNavItem.href}
              icon={UserCircle2}
              label="个人中心 · 账号概览"
              active={profileActive}
              onClick={() => setOpen(false)}
            />
            <AccountActionLink
              to="/profile?tab=api"
              icon={BookOpen}
              label="接口密钥与 API 文档"
              onClick={() => setOpen(false)}
            />
            <AccountActionLink
              to="/profile?tab=credits"
              icon={Coins}
              label="积分中心与每日签到"
              onClick={() => setOpen(false)}
            />
            {session.role === "admin" ? (
              <AccountActionLink
                to="/rbac"
                icon={ShieldCheck}
                label="角色与权限矩阵"
                onClick={() => setOpen(false)}
              />
            ) : null}
            <div className="my-1 h-px bg-border/70" />
            <button
              type="button"
              className="flex min-h-9 items-center justify-between rounded-xl px-2.5 py-2 text-[13px] font-medium text-status-danger transition-all hover:bg-status-danger-soft/75 motion-safe:active:scale-[0.985]"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
            >
              <span className="inline-flex items-center gap-2.5">
                <LogOut className="size-4" />
                <span>退出登录</span>
              </span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountActionLink({
  to,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "group flex min-h-9 items-center justify-between rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all hover:bg-surface-hover motion-safe:active:scale-[0.985]",
        active ? "bg-surface-muted font-semibold text-foreground" : "text-foreground"
      )}
    >
      <span className="inline-flex items-center gap-2.5">
        <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span>{label}</span>
      </span>
      <ArrowUpRight className="size-3.5 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function AccountSummary({
  session,
  roleLabel,
  displayName,
  initial,
  creditBalance,
  canRecharge,
  onClose,
}: {
  session: StoredAuthSession;
  roleLabel: string;
  displayName: string;
  initial: string;
  creditBalance: string;
  canRecharge: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-1 pt-0.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-sm font-semibold text-background shadow-2xs">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {roleLabel}
            </span>
          </div>
          <code
            className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground"
            title={webConfig.appVersion}
          >
            @{session.subjectId || session.role} · v{webConfig.appVersion.replace(/^v/i, "").split("-")[0]}
          </code>
        </div>
      </div>

      <div className="rounded-xl bg-surface-muted/85 p-3 ring-1 ring-inset ring-border/70">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              算力积分余额
            </div>
            <div className="mt-0.5 font-mono text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {creditBalance}
            </div>
          </div>
          <Link
            to={canRecharge ? "/recharge" : "/profile?tab=credits"}
            onClick={onClose}
            className="inline-flex h-7.5 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs font-medium text-background shadow-2xs transition-opacity hover:opacity-90"
          >
            <span>{canRecharge ? "充值" : "明细"}</span>
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>
    </>
  );
}
