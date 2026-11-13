"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Coins } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { AnnouncementNotifications } from "@/components/announcement-banner";
import { BannerAnnouncementsBar } from "@/components/banner-announcements-bar";
import { ImageTaskQueue } from "@/components/image-task-queue";
import { AccountMenu, ThemeToggleButton } from "@/components/top-nav-controls";
import {
  buildWorkspaceNavItems,
  getMobileWorkspaceNavItems,
  isStudioWorkspaceRoute,
  isWorkspaceNavItemActive,
  normalizeWorkspacePath,
  type WorkspaceNavItem,
} from "@/components/workspace/workspace-navigation";
import { fetchProfileCredits, logout } from "@/lib/api";
import { normalizeBrandTitle } from "@/lib/app-meta";
import { QUOTA_REFRESH_EVENT } from "@/lib/quota-events";
import {
  AUTH_SESSION_CHANGE_EVENT,
  clearVerifiedAuthSession,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";
import {
  applyColorTheme,
  COLOR_THEME_CHANGE_EVENT,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { useAppMeta } from "@/lib/use-app-meta";
import { fetchPaymentSettings } from "@/lib/user-admin-api";
import { cn } from "@/lib/utils";
import {
  canAccessPath,
  hasAPIPermission,
  type StoredAuthSession,
} from "@/store/auth";

function watchCreditBalance(
  setCreditBalance: (value: string | ((current: string) => string)) => void,
) {
  let active = true;
  let debounceTimer: number | undefined;

  const loadCredits = async () => {
    try {
      const data = await fetchProfileCredits();
      if (active) setCreditBalance(String(data.balance ?? "--"));
    } catch {
      if (active) {
        setCreditBalance((current) => (current === "加载中..." ? "--" : current));
      }
    }
  };

  const handleRefresh = () => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void loadCredits();
    }, 220);
  };

  void loadCredits();
  window.addEventListener("focus", handleRefresh);
  window.addEventListener(QUOTA_REFRESH_EVENT, handleRefresh);
  return () => {
    active = false;
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }
    window.removeEventListener("focus", handleRefresh);
    window.removeEventListener(QUOTA_REFRESH_EVENT, handleRefresh);
  };
}

function RailItemLink({
  item,
  pathname,
}: {
  item: WorkspaceNavItem;
  pathname: string;
}) {
  const active = isWorkspaceNavItemActive(pathname, item);
  const Icon = item.icon;

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        title={item.title}
        aria-label={`${item.label}（新标签页打开）`}
        className="group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
      >
        <div className="relative flex items-center justify-center">
          <Icon className="size-5 shrink-0 stroke-[1.85]" />
          <ArrowUpRight className="absolute -top-1 -right-2.5 size-2.5 opacity-60 transition-opacity group-hover:opacity-100" />
        </div>
        <span className="max-w-full truncate text-[11px] leading-tight font-medium">
          {item.label}
        </span>
      </a>
    );
  }

  return (
    <NavLink
      to={item.href}
      title={item.title}
      onMouseEnter={() => preloadRoute(item.href)}
      onFocus={() => preloadRoute(item.href)}
      className={cn(
        "group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25",
        active
          ? "bg-foreground/[0.10] font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-2.5 bottom-2.5 left-0 w-[2.5px] rounded-r-full bg-foreground"
        />
      ) : null}
      <Icon
        className={cn(
          "size-5 shrink-0 transition-transform duration-150",
          active ? "stroke-[2.1] text-foreground" : "stroke-[1.85]",
        )}
      />
      <span className="max-w-full truncate text-[11px] leading-tight">
        {item.label}
      </span>
    </NavLink>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = normalizeWorkspacePath(location.pathname);
  const appMeta = useAppMeta();
  const brandTitle = normalizeBrandTitle(appMeta.app_title);
  const isStudioRoute = isStudioWorkspaceRoute(pathname);

  const [session, setSession] = useState<StoredAuthSession | null | undefined>(
    () => getCachedAuthSession(),
  );
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const [creditBalance, setCreditBalance] = useState("--");
  const [rechargeEnabled, setRechargeEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const storedSession = await getVerifiedAuthSession();
      if (active) setSession(storedSession);
    };
    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const handleSessionChange = () =>
      setSession(getCachedAuthSession() ?? null);
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () =>
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
  }, []);

  useEffect(() => {
    const syncTheme = () => setTheme(getPreferredColorTheme());
    window.addEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!session || !hasAPIPermission(session, "GET", "/api/payment/settings")) {
      setRechargeEnabled(false);
      return;
    }
    let active = true;
    void fetchPaymentSettings()
      .then((result) => {
        if (active) setRechargeEnabled(result.item.recharge_enabled);
      })
      .catch(() => {
        if (active) setRechargeEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setCreditBalance("--");
      return;
    }
    return watchCreditBalance(setCreditBalance);
  }, [session]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore server-side logout error and clear local session state.
    }
    await clearVerifiedAuthSession();
    navigate("/", { replace: true });
  };

  const handleThemeToggle = (button?: HTMLButtonElement) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    if (button) {
      const rect = button.getBoundingClientRect();
      applyColorTheme(nextTheme, {
        force: true,
        origin: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      });
    } else {
      applyColorTheme(nextTheme, { force: true });
    }
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  const railItems = useMemo(
    () =>
      buildWorkspaceNavItems({
        session,
        checkAccess: canAccessPath,
        canvasUrl: appMeta.canvas_url,
      }),
    [appMeta.canvas_url, session],
  );

  const mobileItems = useMemo(
    () => getMobileWorkspaceNavItems(railItems),
    [railItems],
  );

  const roleLabel =
    session?.role === "admin" ? "管理员" : session?.roleName || "普通用户";
  const canAccessAdmin = Boolean(session && canAccessPath(session, "/admin"));
  const canAccessStudioTasks = Boolean(
    session && (canAccessPath(session, "/image") || canAccessPath(session, "/video")),
  );
  const canOpenWallet = Boolean(session && canAccessPath(session, "/wallet"));
  const homeHref = session
    ? canAccessPath(session, "/image")
      ? "/image"
      : canAccessPath(session, "/video")
        ? "/video"
        : canAccessPath(session, "/assets")
          ? "/assets"
          : canOpenWallet
            ? "/wallet"
            : "/profile"
    : "/image";

  return (
    <div className="flex h-dvh w-full min-w-0 overflow-hidden bg-background text-foreground">
      {session ? (
        <AnnouncementNotifications target="image" triggerless />
      ) : null}

      {/* Desktop 72px Left Vertical Rail */}
      <aside
        aria-label="创作工作台主导航"
        className="hidden h-dvh w-[72px] shrink-0 flex-col items-center justify-between border-r border-border/65 bg-surface px-2 py-3 select-none lg:flex dark:bg-[#0b0b0d]"
      >
        <div className="flex w-full flex-col items-center gap-3">
          <Link
            to={homeHref}
            onMouseEnter={() => preloadRoute(homeHref)}
            title={`${brandTitle} · 返回创作工作台`}
            aria-label={`${brandTitle} · 返回创作工作台`}
            className="group flex size-10 items-center justify-center rounded-xl transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
          >
            <img
              src="/logo-mark.svg"
              alt=""
              aria-hidden="true"
              className="size-8 rounded-lg shadow-xs"
            />
          </Link>

          <nav className="flex w-full flex-col items-center gap-1">
            {railItems.map((item) => (
              <RailItemLink key={item.id} item={item} pathname={pathname} />
            ))}
          </nav>
        </div>

        {/* Rail Bottom Footer */}
        {session ? (
          <div className="flex w-full flex-col items-center gap-1.5 border-t border-border/55 pt-2.5">
            <Link
              to={canOpenWallet ? "/wallet" : "/profile?tab=credits"}
              onMouseEnter={() =>
                preloadRoute(canOpenWallet ? "/wallet" : "/profile")
              }
              title={`当前算力积分：${creditBalance}（点击管理积分与权益）`}
              aria-label={`当前算力积分 ${creditBalance}`}
              className="group flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-1 py-1.5 text-center transition-colors hover:border-amber-500/45 hover:bg-amber-500/15 dark:border-amber-400/25 dark:bg-amber-400/10 dark:hover:border-amber-400/45"
            >
              <Coins className="size-3.5 text-amber-600 dark:text-amber-300" />
              <span className="max-w-full truncate font-mono text-[10.5px] leading-tight font-semibold text-amber-800 tabular-nums dark:text-amber-200">
                {creditBalance}
              </span>
            </Link>

            {canAccessStudioTasks ? (
              <ImageTaskQueue className="size-8 px-0" />
            ) : null}

            <AnnouncementNotifications
              target="image"
              className="size-8"
              autoOpen={false}
            />

            <ThemeToggleButton
              theme={theme}
              onToggle={handleThemeToggle}
              className="size-8"
            />

            <AccountMenu
              session={session}
              roleLabel={roleLabel}
              creditBalance={creditBalance}
              canRecharge={rechargeEnabled && canOpenWallet}
              canAccessAdmin={canAccessAdmin}
              pathname={pathname}
              search={location.search}
              onLogout={handleLogout}
              compact
              popoverSide="right"
              popoverAlign="end"
            />
          </div>
        ) : (
          <div className="h-24 w-full" />
        )}
      </aside>

      {/* Main Stage Area */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Mobile (<lg) Compact 48px Top Bar */}
        {session ? (
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-surface/95 px-3 backdrop-blur-md lg:hidden dark:bg-[#0b0b0d]/95">
            <Link
              to={homeHref}
              className="flex min-w-0 items-center gap-2 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
            >
              <img
                src="/logo-mark.svg"
                alt=""
                aria-hidden="true"
                className="size-6 shrink-0 rounded-md"
              />
              <span className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
                {brandTitle}
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              <Link
                to={canOpenWallet ? "/wallet" : "/profile?tab=credits"}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-400/25 dark:bg-amber-400/12 dark:text-amber-200"
              >
                <Coins className="size-3 text-amber-600 dark:text-amber-300" />
                <span className="font-mono">{creditBalance}</span>
              </Link>
              {canAccessStudioTasks ? (
                <ImageTaskQueue className="size-8 px-0" />
              ) : null}
              <AnnouncementNotifications
                target="image"
                className="size-8"
                autoOpen={false}
              />
              <ThemeToggleButton
                theme={theme}
                onToggle={handleThemeToggle}
                className="size-8"
              />
              <AccountMenu
                session={session}
                roleLabel={roleLabel}
                creditBalance={creditBalance}
                canRecharge={rechargeEnabled && canOpenWallet}
                canAccessAdmin={canAccessAdmin}
                pathname={pathname}
                search={location.search}
                onLogout={handleLogout}
                compact
              />
            </div>
          </header>
        ) : null}

        <BannerAnnouncementsBar target="image" />

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1",
            isStudioRoute
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-7",
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile (<lg) Fixed Bottom Navigation Bar */}
      {session && mobileItems.length > 0 ? (
        <nav
          aria-label="移动端主导航"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-border/70 bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          {mobileItems.map((item) => {
            const active = isWorkspaceNavItemActive(pathname, item);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.href}
                onTouchStart={() => preloadRoute(item.href)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10.5px] transition-colors",
                  active
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4.5 shrink-0",
                    active ? "stroke-[2.15]" : "stroke-[1.8]",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
