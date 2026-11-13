"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { SettingsDataController } from "@/app/settings/settings-data-controller";
import { SettingsDirtyRegistryProvider } from "@/app/settings/settings-dirty-registry";
import { useSettingsDirtyRegistry } from "@/app/settings/settings-dirty-registry-hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import webConfig from "@/constants/common-env";
import { normalizeBrandTitle } from "@/lib/app-meta";
import {
  AUTH_SESSION_CHANGE_EVENT,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";
import { useAppMeta } from "@/lib/use-app-meta";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import { cn } from "@/lib/utils";
import { canAccessPath, type StoredAuthSession } from "@/store/auth";

import {
  findCurrentAdminNavItem,
  getAccessibleAdminNavGroups,
  isAdminNavItemActive,
} from "./admin-navigation";

const SIDEBAR_COLLAPSED_KEY = "shengtu:v6:admin-sidebar-collapsed";

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function AdminUnsavedRouteGuard() {
  const dirtyRegistry = useSettingsDirtyRegistry();
  const dirtyEntries = useMemo(
    () =>
      Object.values(dirtyRegistry?.entries ?? {}).filter(
        (entry) => entry.isDirty,
      ),
    [dirtyRegistry?.entries],
  );
  const hasDirtyEntries = dirtyEntries.length > 0;

  const handleSaveBeforeLeave = useCallback(async () => {
    for (const entry of dirtyEntries) {
      if (entry.validate && !entry.validate()) {
        return false;
      }
    }
    for (const entry of dirtyEntries) {
      if (entry.save) {
        const ok = await entry.save();
        if (!ok) return false;
      }
    }
    return true;
  }, [dirtyEntries]);

  const handleDiscardBeforeLeave = useCallback(async () => {
    for (const entry of dirtyEntries) {
      if (entry.discard) {
        const ok = await entry.discard();
        if (ok === false) return false;
      }
    }
    return true;
  }, [dirtyEntries]);

  const leaveGuard = useUnsavedRouteGuard({
    when: hasDirtyEntries,
    onSave: handleSaveBeforeLeave,
    onDiscard: handleDiscardBeforeLeave,
  });

  return (
    <ConfirmDialog
      open={leaveGuard.isOpen}
      tone="warning"
      title="当前页面有未保存的配置修改"
      description="离开当前管理页面前是否先保存已修改的参数？若放弃修改，未保存内容将还原为线上已保存状态。"
      impactItems={dirtyEntries.map((entry) => entry.label)}
      cancelLabel="留在此页"
      confirmLabel="保存并离开"
      pendingLabel="保存中…"
      pending={leaveGuard.isSaving}
      secondaryAction={{
        label: "放弃修改并离开",
        pending: leaveGuard.isDiscarding,
        pendingLabel: "正在离开…",
        variant: "destructive",
        onClick: () => void leaveGuard.confirmDiscardAndLeave(),
      }}
      onClose={leaveGuard.cancelLeave}
      onConfirm={() => void leaveGuard.confirmSaveAndLeave()}
    />
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/admin";
  const appMeta = useAppMeta();
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(
    () => getCachedAuthSession(),
  );
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = () => {
      const cached = getCachedAuthSession();
      if (cached !== undefined) setSession(cached);
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
    void getVerifiedAuthSession().then((verified) => {
      if (active) setSession(verified);
    });
    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
    };
  }, []);

  const brandTitle = normalizeBrandTitle(appMeta.app_title);
  const versionTag = `v${webConfig.appVersion.replace(/^v/i, "").split("-")[0]}`;
  const navGroups = getAccessibleAdminNavGroups(session, canAccessPath);
  const currentNavItem = findCurrentAdminNavItem(pathname);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("admin-overlays");
    return () => {
      document.body.classList.remove("admin-overlays");
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <SettingsDirtyRegistryProvider>
      <SettingsDataController />
      <AdminUnsavedRouteGuard />
      <div
        id="admin-root"
        data-admin-root=""
        className="h-dvh w-full overflow-hidden select-none sm:select-auto"
      >
        <div className="admin-shell flex h-full w-full flex-col lg:flex-row">
          {/* Mobile top navigation bar (<lg) */}
          <div className="admin-mobile-navigation flex shrink-0 items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="admin-mobile-navigation-trigger"
              aria-label="打开管理导航菜单"
            >
              <Menu className="size-4" />
              <span className="text-xs font-semibold">
                {currentNavItem?.label || "管理控制台"}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <Link
                to="/admin/settings/system?tab=update"
                className="rounded border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--admin-text-muted)]"
              >
                {versionTag}
              </Link>
              <Link to="/image" className="admin-mobile-navigation-action">
                <ArrowLeft className="size-3.5" />
                <span className="text-xs font-medium">返回创作台</span>
              </Link>
            </div>
          </div>

          {/* Desktop fixed hairline sidebar (lg+) */}
          <aside
            aria-label="管理控制台侧边栏"
            className={cn(
              "admin-sidebar hidden h-full shrink-0 flex-col lg:flex",
              collapsed && "is-collapsed",
            )}
          >
            <div className="admin-sidebar-identity">
              <div
                className={cn(
                  "admin-sidebar-brand-button",
                  collapsed && "is-collapsed",
                )}
              >
                <Link
                  to="/admin"
                  title={`${brandTitle} 管理控制台`}
                  className="inline-flex shrink-0 items-center justify-center"
                >
                  <img
                    src="/logo-mark.svg"
                    alt=""
                    className="admin-sidebar-brand-mark"
                  />
                </Link>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <Link
                        to="/admin"
                        className="admin-sidebar-brand-title truncate hover:opacity-90"
                      >
                        {brandTitle}
                      </Link>
                      <Link
                        to="/admin/settings/system?tab=update"
                        title="查看版本与在线升级"
                        className="shrink-0 rounded border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--admin-text-muted)] transition-colors hover:text-[var(--admin-text)]"
                      >
                        {versionTag}
                      </Link>
                    </div>
                    <div className="admin-sidebar-brand-version mt-0.5 truncate">
                      管理控制台
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <nav className="admin-sidebar-nav thin-scrollbar min-h-0 flex-1 overflow-y-auto">
              {navGroups.map((group, groupIndex) => (
                <div key={group.id} className="admin-nav-group">
                  {collapsed ? (
                    groupIndex > 0 ? (
                      <div className="admin-nav-collapsed-separator" />
                    ) : null
                  ) : (
                    <div className="admin-nav-group-label">
                      <span>{group.label}</span>
                    </div>
                  )}
                  <div className="admin-nav-group-items">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isAdminNavItemActive(pathname, item);
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          title={collapsed ? `${group.label} · ${item.label}` : undefined}
                          onMouseEnter={() => preloadRoute(item.href)}
                          onFocus={() => preloadRoute(item.href)}
                          className={cn(
                            "admin-nav-link",
                            collapsed && "is-collapsed",
                            active && "is-active",
                          )}
                        >
                          <Icon />
                          {!collapsed ? (
                            <span className="truncate">{item.label}</span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="admin-sidebar-footer">
              <Link
                to="/image"
                title={collapsed ? "返回创作台" : undefined}
                className={cn(
                  "admin-nav-link",
                  collapsed && "is-collapsed",
                )}
              >
                <ArrowLeft />
                {!collapsed ? <span className="truncate">返回创作台</span> : null}
              </Link>
            </div>
          </aside>

          {/* Desktop sidebar edge pill toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "展开侧边导航栏" : "收起侧边导航栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className={cn(
              "admin-sidebar-edge-toggle hidden lg:grid",
              collapsed && "is-collapsed",
            )}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronLeft className="size-3.5" />
            )}
          </button>

          {/* Main coordinate-grid viewport */}
          <main className="admin-page-root min-w-0 flex-1 overflow-hidden">
            {children}
          </main>
        </div>

        {/* Mobile navigation drawer (<lg) */}
        <DialogPrimitive.Root
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] lg:hidden" />
            <DialogPrimitive.Content className="admin-drawer fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(260px,84vw)] flex-col border-r border-l-0 border-[var(--admin-border)] bg-[var(--admin-sidebar)] outline-none lg:hidden">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--admin-border)] px-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img src="/logo-mark.svg" alt="" className="size-6 rounded" />
                  <DialogPrimitive.Title className="truncate text-[13px] font-semibold text-[var(--admin-text)]">
                    {brandTitle}
                  </DialogPrimitive.Title>
                </div>
                <DialogPrimitive.Close
                  aria-label="关闭菜单"
                  className="inline-grid size-7 place-items-center rounded-[6px] border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)]"
                >
                  <X className="size-3.5" />
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Description className="sr-only">
                管理控制台分组导航抽屉
              </DialogPrimitive.Description>

              <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
                {navGroups.map((group) => (
                  <div key={group.id} className="mb-4 last:mb-0">
                    <div className="mb-1.5 px-2 text-[11px] font-semibold text-[var(--admin-text-muted)]">
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isAdminNavItemActive(pathname, item);
                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex h-8.5 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-medium transition-colors",
                              active
                                ? "bg-[var(--admin-nav-active)] font-semibold text-[var(--admin-text)]"
                                : "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-nav-hover)] hover:text-[var(--admin-text)]",
                            )}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="border-t border-[var(--admin-border)] p-2.5">
                <Link
                  to="/image"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-8.5 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-medium text-[var(--admin-text-secondary)] hover:bg-[var(--admin-nav-hover)] hover:text-[var(--admin-text)]"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span>返回创作台</span>
                </Link>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </SettingsDirtyRegistryProvider>
  );
}
