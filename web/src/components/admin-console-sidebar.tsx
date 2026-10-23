"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
const SIDEBAR_ACTIVE_LAYOUT_ID = "admin-console-sidebar-active-pill";

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
  const prefersReducedMotion = useReducedMotion();
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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

  // Auto-expand the group containing the currently active route (open-ai-canvas pattern)
  useEffect(() => {
    const activeGroup = ADMIN_SIDEBAR_GROUPS.find((g) =>
      g.hrefs.some((href) => isActivePath(pathname, href))
    );
    if (activeGroup) {
      setCollapsedGroups((prev) =>
        prev[activeGroup.id] ? { ...prev, [activeGroup.id]: false } : prev
      );
    }
  }, [pathname]);

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

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <aside
      aria-label="管理控制台导航"
      className={cn(
        "studio-stage-frame sticky top-17 hidden max-h-[calc(100dvh-5.25rem)] shrink-0 flex-col justify-between overflow-y-auto rounded-2xl p-2.5 transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
        collapsed ? "w-15" : "w-54"
      )}
    >
      <div className="space-y-3">
        <div
          className={cn(
            "flex items-center rounded-xl bg-surface-muted/65 px-2 py-1.5",
            collapsed ? "justify-center px-0" : "justify-between"
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-2xs">
                <LayoutGrid className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold tracking-tight text-foreground">
                  管理控制台
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  CONSOLE
                </div>
              </div>
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

        <nav aria-label="管理模块列表" className="space-y-3">
          {visibleGroups.map((group) => {
            const isGroupCollapsed = !collapsed && Boolean(collapsedGroups[group.id]);
            return (
              <div key={group.id} className="space-y-1">
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isGroupCollapsed}
                    className="group flex min-h-6.5 w-full items-center justify-between rounded-md px-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/75 transition-colors hover:bg-surface-hover/60 hover:text-foreground"
                  >
                    <span>{group.label}</span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 text-muted-foreground/55 transition-transform duration-200 group-hover:text-foreground/80",
                        !isGroupCollapsed && "rotate-90"
                      )}
                    />
                  </button>
                ) : null}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-250 ease-out",
                    isGroupCollapsed
                      ? "grid-rows-[0fr] opacity-0"
                      : "grid-rows-[1fr] opacity-100"
                  )}
                >
                  <div className="min-h-0 space-y-0.5 overflow-hidden">
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
                            "group relative isolate flex h-9 items-center rounded-[11px] text-[13px] font-medium transition-colors motion-safe:active:scale-[0.985]",
                            collapsed
                              ? "justify-center px-0"
                              : "gap-2.5 px-2.5",
                            active
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                          )}
                        >
                          {active ? (
                            <motion.span
                              layoutId={SIDEBAR_ACTIVE_LAYOUT_ID}
                              transition={
                                prefersReducedMotion
                                  ? { duration: 0.01 }
                                  : {
                                      type: "spring",
                                      mass: 0.12,
                                      stiffness: 260,
                                      damping: 20,
                                    }
                              }
                              className="absolute inset-0 -z-10 rounded-[11px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-border/85 dark:bg-surface-muted"
                            />
                          ) : null}
                          <Icon
                            className={cn(
                              "relative z-10 size-4 shrink-0 stroke-[1.75] transition-[color,transform] duration-150",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground group-hover:-translate-y-px group-hover:text-foreground"
                            )}
                          />
                          {!collapsed ? (
                            <span className="relative z-10 truncate">
                              {displayLabel}
                            </span>
                          ) : null}
                          {active && !collapsed ? (
                            <span
                              aria-hidden="true"
                              className="relative z-10 ml-auto size-1.5 shrink-0 rounded-full bg-foreground"
                            />
                          ) : null}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="mt-4 rounded-xl bg-surface-muted/70 p-1">
        <Link
          to="/image"
          onMouseEnter={() => preloadRoute("/image")}
          title="返回图片创作工作台"
          aria-label="返回图片创作工作台"
          className={cn(
            "group flex h-8.5 items-center rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground hover:shadow-2xs",
            collapsed ? "justify-center px-0" : "gap-2 px-2.5"
          )}
        >
          <ArrowLeft className="size-3.5 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5" />
          {!collapsed ? <span className="truncate">返回创作工作台</span> : null}
        </Link>
      </div>
    </aside>
  );
}
