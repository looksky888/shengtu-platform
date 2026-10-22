"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { Button } from "@/components/ui/button";
import {
  getNavItemIcon,
  isActivePath,
  isAdminConsolePath,
  navItems,
  type NavItem,
} from "@/components/top-nav-config";
import {
  AUTH_SESSION_CHANGE_EVENT,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";
import { cn } from "@/lib/utils";
import { canAccessPath, type StoredAuthSession } from "@/store/auth";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "shengtu:admin-sidebar-collapsed";

type AdminNavGroup = {
  id: string;
  label: string;
  hrefs: string[];
};

const ADMIN_SIDEBAR_GROUPS: AdminNavGroup[] = [
  {
    id: "ops",
    label: "号池与任务",
    hrefs: ["/accounts", "/task-queue", "/icloud", "/register", "/logs"],
  },
  {
    id: "commercial",
    label: "用户与商业",
    hrefs: ["/users", "/credits-admin", "/payment-admin", "/rbac"],
  },
  {
    id: "system",
    label: "系统配置",
    hrefs: ["/settings"],
  },
];

export function AdminConsoleSidebar() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isConsoleRoute = isAdminConsolePath(pathname);

  const [session, setSession] = useState<
    StoredAuthSession | null | undefined
  >(() => getCachedAuthSession());
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isConsoleRoute) return;
    let active = true;
    void getVerifiedAuthSession().then((resolved) => {
      if (active) setSession(resolved);
    });
    return () => {
      active = false;
    };
  }, [isConsoleRoute, pathname]);

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

  if (!isConsoleRoute || !session) {
    return null;
  }

  const itemByHref = new Map<string, NavItem>(
    navItems.map((item) => [item.href, item])
  );

  const visibleGroups = ADMIN_SIDEBAR_GROUPS.map((group) => {
    const items = group.hrefs
      .map((href) => itemByHref.get(href))
      .filter((item): item is NavItem => Boolean(item))
      .filter((item) => canAccessPath(session, item.accessPath || item.href));
    return {
      ...group,
      items,
    };
  }).filter((group) => group.items.length > 0);

  const totalVisibleItems = visibleGroups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  if (totalVisibleItems <= 1) {
    return null;
  }

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          next ? "1" : "0"
        );
      } catch {
        // Ignore storage write errors in private mode.
      }
      return next;
    });
  };

  return (
    <aside
      aria-label="管理控制台导航"
      className={cn(
        "sticky top-17 hidden max-h-[calc(100dvh-5.25rem)] shrink-0 flex-col justify-between overflow-y-auto rounded-xl border border-border/70 bg-card p-2 shadow-2xs transition-[width] duration-200 lg:flex",
        collapsed ? "w-14" : "w-52"
      )}
    >
      <div className="space-y-3">
        <div
          className={cn(
            "flex items-center border-b border-border/60 pb-2",
            collapsed ? "justify-center" : "justify-between px-1.5"
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                <LayoutGrid className="size-3.5" />
              </span>
              <span className="truncate text-xs font-semibold tracking-tight text-foreground">
                管理控制台
              </span>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "展开管理侧栏" : "收起管理侧栏"}
            title={collapsed ? "展开管理侧栏" : "收起管理侧栏"}
            className="size-7 rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-3.5" />
            ) : (
              <PanelLeftClose className="size-3.5" />
            )}
          </Button>
        </div>

        <nav aria-label="管理模块列表" className="space-y-3.5">
          {visibleGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              {!collapsed ? (
                <div className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground/75">
                  {group.label}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = getNavItemIcon(item);
                  const active = isActivePath(pathname, item.href);
                  const displayLabel =
                    item.href === "/settings" ? "系统设置" : item.label;
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      onMouseEnter={() => preloadRoute(item.href)}
                      onFocus={() => preloadRoute(item.href)}
                      title={collapsed ? displayLabel : item.description}
                      aria-label={displayLabel}
                      className={cn(
                        "group flex h-8.5 items-center rounded-lg text-[13px] font-medium transition-colors",
                        collapsed
                          ? "justify-center px-0"
                          : "gap-2.5 px-2.5",
                        active
                          ? "border border-brand-border bg-brand-soft font-semibold text-brand"
                          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active
                            ? "text-brand"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!collapsed ? (
                        <span className="truncate">{displayLabel}</span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-4 border-t border-border/60 pt-2">
        <Link
          to="/image"
          onMouseEnter={() => preloadRoute("/image")}
          title="返回图片创作工作台"
          aria-label="返回图片创作工作台"
          className={cn(
            "flex h-8.5 items-center rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
            collapsed ? "justify-center px-0" : "gap-2 px-2.5"
          )}
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          {!collapsed ? <span className="truncate">返回创作工作台</span> : null}
        </Link>
      </div>
    </aside>
  );
}
