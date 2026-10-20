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
import {
  AUTH_SESSION_CHANGE_EVENT,
  clearVerifiedAuthSession,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";
import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { useAppMeta } from "@/lib/use-app-meta";
import { fetchPaymentSettings } from "@/lib/user-admin-api";
import { cn } from "@/lib/utils";
import { canAccessPath, type StoredAuthSession } from "@/store/auth";

import {
  navItems,
  partitionNavItems,
  PRIMARY_NAV_ID,
} from "./top-nav-config";
import {
  AccountMenu,
  CreditBalanceBadge,
  MoreNavMenu,
  NavPill,
  ThemeToggleButton,
} from "./top-nav-controls";
import { NavSearchMenu } from "./top-nav-search";

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const appMeta = useAppMeta();
  const brandTitle =
    (appMeta.app_title || DEFAULT_APP_TITLE).trim() || DEFAULT_APP_TITLE;
  const [session, setSession] = useState<
    StoredAuthSession | null | undefined
  >(() => getCachedAuthSession());
  const [theme, setTheme] = useState<ColorTheme>(() =>
    getPreferredColorTheme()
  );
  const [creditBalance, setCreditBalance] = useState("--");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [rechargeEnabled, setRechargeEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Public surfaces: brand Hero + login form — no session chrome needed.
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
      window.removeEventListener(
        AUTH_SESSION_CHANGE_EVENT,
        handleSessionChange
      );
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

  if (
    pathname === "/" ||
    pathname === "/login" ||
    session === undefined ||
    !session
  )
    return null;

  const visibleNavItems = withCanvasNav(navItems, appMeta.canvas_url)
    .filter((item) => item.href !== "/recharge" || rechargeEnabled)
    .filter((item) => canAccessPath(session, item.accessPath || item.href));
  const { primary: primaryNavItems, overflow: overflowNavItems } =
    partitionNavItems(visibleNavItems);
  const roleLabel =
    session.role === "admin" ? "管理员" : session.roleName || "普通用户";
  const canAccessImageTasks = canAccessPath(session, "/image");
  const canAccessRecharge =
    rechargeEnabled && canAccessPath(session, "/recharge");
  const navToggleLabel = navCollapsed ? "展开导航栏" : "收起导航栏";

  return (
    <header className="sticky top-2.5 z-40 min-w-0 rounded-2xl border border-border/80 bg-surface/90 shadow-xs backdrop-blur-xl">
      <div className="flex min-h-12 flex-col gap-1.5 px-3 py-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:px-3.5">
        <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start">
          <NavBrandButton
            collapsed={navCollapsed}
            brandTitle={brandTitle}
            label={navToggleLabel}
            onToggle={() => setNavCollapsed((collapsed) => !collapsed)}
          />
          <TopNavActions
            canAccessImageTasks={canAccessImageTasks}
            canAccessRecharge={canAccessRecharge}
            creditBalance={creditBalance}
            theme={theme}
            session={session}
            roleLabel={roleLabel}
            pathname={pathname}
            onThemeToggle={handleThemeToggle}
            onLogout={handleLogout}
            compact
            className="ml-auto flex shrink-0 items-center gap-1 lg:hidden"
          />
        </div>
        <nav
          id={PRIMARY_NAV_ID}
          aria-label="主导航"
          className={cn(
            "-mx-1 min-w-0 items-center gap-1 px-1 pb-0.5 lg:mx-0 lg:flex-1 lg:gap-1 lg:px-0 lg:pb-0",
            navCollapsed ? "hidden" : "flex"
          )}
        >
          <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain scroll-px-1 touch-pan-x [-webkit-overflow-scrolling:touch]">
            {primaryNavItems.map((item) => (
              <NavPill key={item.href} item={item} pathname={pathname} />
            ))}
            <MoreNavMenu items={overflowNavItems} pathname={pathname} />
          </div>
          <NavSearchMenu
            items={visibleNavItems}
            pathname={pathname}
            theme={theme}
            onToggleTheme={() => handleThemeToggle()}
          />
        </nav>
        <TopNavActions
          canAccessImageTasks={canAccessImageTasks}
          canAccessRecharge={canAccessRecharge}
          creditBalance={creditBalance}
          theme={theme}
          session={session}
          roleLabel={roleLabel}
          pathname={pathname}
          onThemeToggle={handleThemeToggle}
          onLogout={handleLogout}
          className="hidden items-center justify-end gap-1.5 lg:flex"
        />
      </div>
    </header>
  );
}

function watchCreditBalance(
  setCreditBalance: (value: string | ((current: string) => string)) => void
) {
  let active = true;
  const loadCredits = async () => {
    try {
      const data = await fetchProfileCredits();
      if (active) setCreditBalance(String(data.balance ?? "--"));
    } catch {
      if (active)
        setCreditBalance((current) =>
          current === "加载中..." ? "--" : current
        );
    }
  };
  const handleRefresh = () => void loadCredits();
  setCreditBalance("加载中...");
  void loadCredits();
  window.addEventListener("focus", handleRefresh);
  return () => {
    active = false;
    window.removeEventListener("focus", handleRefresh);
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
  const navigate = useNavigate();
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        className="font-display h-8 min-w-0 max-w-[148px] justify-start gap-2 rounded-lg px-1.5 pr-2 text-sm font-semibold text-foreground shadow-none hover:bg-surface-hover sm:max-w-[190px] lg:max-w-none"
        title="返回创作工作台"
        onClick={() => navigate("/image")}
      >
        <img
          src="/logo-mark.svg"
          alt=""
          aria-hidden="true"
          className="size-6 rounded-lg shadow-xs"
        />
        <span className="truncate">{brandTitle}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "lg:hidden",
          collapsed && "bg-surface-muted text-brand"
        )}
        aria-controls={PRIMARY_NAV_ID}
        aria-expanded={!collapsed}
        aria-label={label}
        title={label}
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function TopNavActions({
  canAccessImageTasks,
  canAccessRecharge,
  creditBalance,
  theme,
  session,
  roleLabel,
  pathname,
  onThemeToggle,
  onLogout,
  className,
  compact = false,
}: {
  canAccessImageTasks: boolean;
  canAccessRecharge: boolean;
  creditBalance: string;
  theme: ColorTheme;
  session: StoredAuthSession;
  roleLabel: string;
  pathname: string;
  onThemeToggle: (button: HTMLButtonElement) => void;
  onLogout: () => Promise<void>;
  className: string;
  compact?: boolean;
}) {
  return (
    <div className={className}>
      {canAccessImageTasks ? (
        <ImageTaskQueue className={compact ? "size-8 px-0" : undefined} />
      ) : null}
      <AnnouncementNotifications target="image" className="size-8" />
      {compact ? null : (
        <CreditBalanceBadge
          creditBalance={creditBalance}
          canRecharge={canAccessRecharge}
        />
      )}
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
