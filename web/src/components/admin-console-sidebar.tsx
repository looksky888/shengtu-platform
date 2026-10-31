"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function getItemDisplayLabel(item: NavItem): string {
  return item.href === "/settings" ? "系统设置" : item.label;
}

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
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
        handleSessionChange,
      );
  }, []);

  useEffect(() => {
    setMobileDrawerOpen(false);
    const activeGroup = ADMIN_SIDEBAR_GROUPS.find((g) =>
      g.hrefs.some((href) => isActivePath(pathname, href)),
    );
    if (activeGroup) {
      setCollapsedGroups((prev) =>
        prev[activeGroup.id] ? { ...prev, [activeGroup.id]: false } : prev,
      );
    }
  }, [pathname]);

  if (!isConsoleRoute || !session) {
    return null;
  }

  const itemByHref = new Map<string, NavItem>(
    navItems.map((item) => [item.href, item]),
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
    0,
  );
  if (totalVisibleItems <= 1) {
    return null;
  }

  const activeNavItem =
    visibleGroups
      .flatMap((group) => group.items)
      .find((item) => isActivePath(pathname, item.href)) ??
    visibleGroups[0]?.items[0];
  const ActiveItemIcon = activeNavItem
    ? getNavItemIcon(activeNavItem)
    : LayoutGrid;
  const activeItemLabel = activeNavItem
    ? getItemDisplayLabel(activeNavItem)
    : "管理控制台";

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          next ? "1" : "0",
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
    <>
      <div className="studio-stage-frame flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="打开管理控制台菜单"
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-2xs">
            <ActiveItemIcon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground">
              {activeItemLabel}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              点击切换管理模块（共 {totalVisibleItems} 项）
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link to="/image" onMouseEnter={() => preloadRoute("/image")}>
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">返回工作台</span>
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMobileDrawerOpen(true)}
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
          >
            <Menu className="size-3.5" />
            <span>管理菜单</span>
          </Button>
        </div>
      </div>

      <Dialog open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DialogContent className="top-0 left-0 flex h-dvh max-h-dvh w-[min(20rem,86vw)] max-w-none translate-x-0 translate-y-0 flex-col justify-between gap-4 overflow-y-auto rounded-none rounded-r-2xl border-y-0 border-l-0 p-4 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <div className="space-y-4">
            <DialogHeader className="pr-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-2xs">
                  <LayoutGrid className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold">
                    管理控制台
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    选择需要进入的后台管理模块
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <nav aria-label="移动端管理模块列表" className="space-y-3.5">
              {visibleGroups.map((group) => (
                <div key={group.id} className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/80">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = getNavItemIcon(item);
                      const active = isActivePath(pathname, item.href);
                      const displayLabel = getItemDisplayLabel(item);
                      return (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={() => setMobileDrawerOpen(false)}
                          onMouseEnter={() => preloadRoute(item.href)}
                          onFocus={() => preloadRoute(item.href)}
                          className={cn(
                            "flex h-9.5 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium transition-colors",
                            active
                              ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-border/85 dark:bg-surface-muted"
                              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0 stroke-[1.75]",
                              active ? "text-foreground" : "text-muted-foreground",
                            )}
                          />
                          <span className="truncate">{displayLabel}</span>
                          {active ? (
                            <span
                              aria-hidden="true"
                              className="ml-auto size-1.5 shrink-0 rounded-full bg-foreground"
                            />
                          ) : null}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="rounded-xl bg-surface-muted/70 p-1">
            <Link
              to="/image"
              onClick={() => setMobileDrawerOpen(false)}
              onMouseEnter={() => preloadRoute("/image")}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground hover:shadow-2xs"
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              <span className="truncate">返回创作工作台</span>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <aside
        aria-label="管理控制台导航"
        className={cn(
          "studio-stage-frame sticky top-17 hidden max-h-[calc(100dvh-5.25rem)] shrink-0 flex-col justify-between rounded-2xl p-2.5 transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          collapsed
            ? "w-15 overflow-visible"
            : "w-54 overflow-y-auto overflow-x-hidden",
        )}
      >
        <div className="space-y-3">
          <div
            className={cn(
              "flex items-center rounded-xl bg-surface-muted/65 px-2 py-1.5",
              collapsed ? "justify-center px-0" : "justify-between",
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

          <nav
            aria-label="管理模块列表"
            className={cn(collapsed ? "space-y-1.5" : "space-y-3")}
          >
            {visibleGroups.map((group, groupIndex) => {
              const isGroupCollapsed =
                !collapsed && Boolean(collapsedGroups[group.id]);
              return (
                <div key={group.id} className="space-y-1">
                  {collapsed && groupIndex > 0 ? (
                    <div
                      aria-hidden="true"
                      className="mx-1.5 my-1.5 h-px bg-border/75"
                    />
                  ) : null}
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
                          !isGroupCollapsed && "rotate-90",
                        )}
                      />
                    </button>
                  ) : null}
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-250 ease-out",
                      isGroupCollapsed
                        ? "grid-rows-[0fr] opacity-0"
                        : "grid-rows-[1fr] opacity-100",
                    )}
                  >
                    <div
                      className={cn(
                        "min-h-0 space-y-0.5",
                        collapsed ? "overflow-visible" : "overflow-hidden",
                      )}
                    >
                      {group.items.map((item) => {
                        const Icon = getNavItemIcon(item);
                        const active = isActivePath(pathname, item.href);
                        const displayLabel = getItemDisplayLabel(item);
                        return (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            onMouseEnter={() => preloadRoute(item.href)}
                            onFocus={() => preloadRoute(item.href)}
                            title={collapsed ? undefined : item.description}
                            aria-label={displayLabel}
                            className={cn(
                              "group relative isolate flex h-9 items-center rounded-[11px] text-[13px] font-medium transition-colors motion-safe:active:scale-[0.985]",
                              collapsed
                                ? "justify-center px-0"
                                : "gap-2.5 px-2.5",
                              active
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
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
                            {active && collapsed ? (
                              <span
                                aria-hidden="true"
                                className="absolute top-2 bottom-2 left-0.5 z-10 w-0.5 rounded-full bg-foreground"
                              />
                            ) : null}
                            <Icon
                              className={cn(
                                "relative z-10 size-4 shrink-0 stroke-[1.75] transition-[color,transform] duration-150",
                                active
                                  ? "text-foreground"
                                  : "text-muted-foreground group-hover:-translate-y-px group-hover:text-foreground",
                              )}
                            />
                            {collapsed ? (
                              <span
                                role="tooltip"
                                className="pointer-events-none invisible absolute top-1/2 left-[calc(100%+10px)] z-50 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border/85 bg-surface-raised px-2.5 py-1 text-xs font-medium text-foreground opacity-0 shadow-md transition-all duration-100 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                              >
                                {displayLabel}
                              </span>
                            ) : (
                              <span className="relative z-10 truncate">
                                {displayLabel}
                              </span>
                            )}
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
              collapsed ? "justify-center px-0" : "gap-2 px-2.5",
            )}
          >
            <ArrowLeft className="size-3.5 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5" />
            {!collapsed ? (
              <span className="truncate">返回创作工作台</span>
            ) : null}
          </Link>
        </div>
      </aside>
    </>
  );
}
