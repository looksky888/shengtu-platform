"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { AnnouncementNotifications } from "@/components/announcement-banner";
import { ImageTaskQueue } from "@/components/image-task-queue";
import { Button } from "@/components/ui/button";
import { fetchProfileCredits, logout } from "@/lib/api";
import { DEFAULT_APP_TITLE } from "@/lib/app-meta";
import { withCanvasNav } from "@/lib/canvas-link";
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
import { fetchPaymentSettings } from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";
import { canAccessPath, type StoredAuthSession } from "@/store/auth";

import { navItems, partitionNavItems, PRIMARY_NAV_ID } from "./top-nav-config";
import {
  AccountMenu,
  CreditBalanceBadge,
  MoreNavMenu,
  NavPill,
  ThemeToggleButton,
} from "./top-nav-controls";

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const appMeta = useAppMeta();
  const brandTitle =
    (appMeta.app_title || DEFAULT_APP_TITLE).trim() || DEFAULT_APP_TITLE;
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(
    () => getCachedAuthSession(),
  );
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const [creditBalance, setCreditBalance] = useState("--");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [rechargeEnabled, setRechargeEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (pathname === "/" || pathname === "/login") {
        if (active) setSession(null);
        return;
      }
      const storedSession = await getVerifiedAuthSession();
      if (active) setSession(storedSession);
    };
    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<ColorTheme>).detail;
      if (next === "light" || next === "dark") {
        setTheme(next);
      } else {
        setTheme(getPreferredColorTheme());
      }
    };
    window.addEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(COLOR_THEME_CHANGE_EVENT, syncTheme);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void fetchPaymentSettings()
      .then((result) => {
        if (active) setRechargeEnabled(result.item.recharge_enabled);
      })
      .catch(() => {
        if (active) setRechargeEnabled(true);
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    const handleSessionChange = () =>
      setSession(getCachedAuthSession() ?? null);
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () =>
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
  }, []);

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
      // Ignore server-side logout failure and continue local session cleanup.
    }
    await clearVerifiedAuthSession();
    navigate("/", { replace: true });
  };

  const handleThemeToggle = (button: HTMLButtonElement) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const rect = button.getBoundingClientRect();
    applyColorTheme(nextTheme, {
      force: true,
      origin: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
    saveColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  if (
    pathname === "/" ||
    pathname === "/login" ||
    session === undefined ||
    !session
  ) {
    return null;
  }

  const visibleNavItems = withCanvasNav(navItems, appMeta.canvas_url)
    .filter((item) => item.href !== "/recharge" || rechargeEnabled)
    .filter((item) => canAccessPath(session, item.accessPath || item.href));
  const { primary: primaryNavItems, overflow: overflowNavItems } =
    partitionNavItems(visibleNavItems);
  const roleLabel =
    session.role === "admin"
      ? "管理员"
      : session.roleName || "普通用户";
  const canAccessImageTasks = canAccessPath(session, "/image");
  const navToggleLabel = navCollapsed ? "展开导航栏" : "收起导航栏";

  return (
    <header className="sticky top-3 z-40 min-w-0 rounded-[24px] border border-border bg-card/90 shadow-[0_0_22.576px_rgba(44,74,116,0.09)] backdrop-blur dark:border-border dark:bg-card/92">
      <div className="flex min-h-14 flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-4">
        <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start">
          <NavBrandButton
            collapsed={navCollapsed}
            brandTitle={brandTitle}
            label={navToggleLabel}
            onToggle={() => setNavCollapsed((collapsed) => !collapsed)}
          />
          <TopNavActions
            canAccessImageTasks={canAccessImageTasks}
            creditBalance={creditBalance}
            theme={theme}
            session={session}
            roleLabel={roleLabel}
            pathname={pathname}
            onThemeToggle={handleThemeToggle}
            onLogout={handleLogout}
            showAnnouncements={false}
            compact
            className="ml-auto flex shrink-0 items-center gap-1 lg:hidden"
          />
        </div>

        <nav
          id={PRIMARY_NAV_ID}
          aria-label="主导航"
          className={cn(
            "-mx-1 min-w-0 items-center gap-1 px-1 pb-0.5 lg:mx-0 lg:flex-1 lg:gap-1.5 lg:px-0 lg:pb-0",
            navCollapsed ? "hidden" : "flex",
          )}
        >
          <div className="hide-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain scroll-px-1 touch-pan-x [-webkit-overflow-scrolling:touch] lg:gap-1.5">
            {primaryNavItems.map((item) => (
              <NavPill key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
          <MoreNavMenu items={overflowNavItems} pathname={pathname} />
        </nav>

        <TopNavActions
          canAccessImageTasks={canAccessImageTasks}
          creditBalance={creditBalance}
          theme={theme}
          session={session}
          roleLabel={roleLabel}
          pathname={pathname}
          onThemeToggle={handleThemeToggle}
          onLogout={handleLogout}
          showAnnouncements
          className="hidden items-center justify-end gap-1.5 lg:flex"
        />
      </div>
    </header>
  );
}

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
        setCreditBalance((current) =>
          current === "加载中..." ? "--" : current,
        );
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

  setCreditBalance("加载中...");
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

function NavBrandButton({
  collapsed,
  brandTitle,
  label,
  onToggle,
}: {
  collapsed: boolean;
  brandTitle: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "font-display h-9 min-w-0 max-w-[136px] justify-start rounded-full px-1.5 pr-2 text-[15px] font-semibold text-[#18181b] shadow-none hover:bg-black/[0.04] hover:text-[#1456f0] sm:max-w-[190px] lg:max-w-none dark:text-foreground dark:hover:text-sky-300",
        collapsed
          ? "bg-black/[0.04] text-[#1456f0] dark:bg-accent dark:text-sky-300"
          : "",
      )}
      aria-controls={PRIMARY_NAV_ID}
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <img
        src="/logo-mark.svg"
        alt=""
        aria-hidden="true"
        className="size-7 rounded-[10px] shadow-[0_4px_10px_rgba(184,90,127,0.16)]"
      />
      <span className="truncate">{brandTitle}</span>
      {collapsed ? (
        <ChevronDown aria-hidden="true" />
      ) : (
        <ChevronUp aria-hidden="true" />
      )}
    </Button>
  );
}

function TopNavActions({
  canAccessImageTasks,
  creditBalance,
  theme,
  session,
  roleLabel,
  pathname,
  onThemeToggle,
  onLogout,
  className,
  showAnnouncements = true,
  compact = false,
}: {
  canAccessImageTasks: boolean;
  creditBalance: string;
  theme: ColorTheme;
  session: StoredAuthSession;
  roleLabel: string;
  pathname: string;
  onThemeToggle: (button: HTMLButtonElement) => void;
  onLogout: () => Promise<void>;
  className: string;
  showAnnouncements?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={className}>
      {canAccessImageTasks ? (
        <ImageTaskQueue className={compact ? "size-8 px-0" : undefined} />
      ) : null}
      <AnnouncementNotifications
        target="image"
        autoOpen={showAnnouncements}
        className="size-8 rounded-full"
      />
      {compact ? null : <CreditBalanceBadge creditBalance={creditBalance} />}
      <ThemeToggleButton theme={theme} onToggle={onThemeToggle} />
      <AccountMenu
        session={session}
        roleLabel={roleLabel}
        creditBalance={creditBalance}
        pathname={pathname}
        onLogout={onLogout}
        compact={compact}
      />
    </div>
  );
}
