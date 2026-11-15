"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Boxes,
  HardDrive,
  Mail,
  Megaphone,
  RefreshCw,
  Server,
  Shield,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import { cn } from "@/lib/utils";

import { SettingsStickySaveBar } from "./components/settings-sticky-save-bar";
import { SettingsDataController } from "./settings-data-controller";
import {
  SettingsDirtyRegistryProvider,
  type NormalizedDirtyEntry,
} from "./settings-dirty-registry";
import { useSettingsDirtyRegistry } from "./settings-dirty-registry-hooks";
import { SettingsTabContent } from "./settings-tab-content";
import {
  getSettingsTabMeta,
  parseSettingsTab,
  SETTINGS_DOMAIN_GROUPS,
  SETTINGS_NAVIGATE_TAB_EVENT,
  SETTINGS_TABS,
  type SettingsTabKey,
} from "./settings-tab-types";
import { useSettingsStore } from "./store";

export const SETTINGS_TAB_REFRESH_EVENT = "shengtu:settings-tab-refresh";

const SETTINGS_TAB_ICONS: Readonly<Record<SettingsTabKey, LucideIcon>> = {
  config: SlidersHorizontal,
  channels: Boxes,
  proxy: Shield,
  cpa: Server,
  email: Mail,
  media: HardDrive,
  announcements: Megaphone,
  backup: Archive,
  system: Sparkles,
};

export function SettingsTabs({
  canManageSystem,
}: {
  canManageSystem: boolean;
}) {
  return (
    <SettingsDirtyRegistryProvider>
      <SettingsTabsInner canManageSystem={canManageSystem} />
    </SettingsDirtyRegistryProvider>
  );
}

function SettingsTabsInner({
  canManageSystem,
}: {
  canManageSystem: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = parseSettingsTab(searchParams.get("tab"));
  const activeTab: SettingsTabKey =
    !canManageSystem && rawTab === "media" ? "config" : rawTab;
  const activeMeta = getSettingsTabMeta(activeTab);

  const [pendingTab, setPendingTab] = useState<SettingsTabKey | null>(null);
  const [isSavingTabSwitch, setIsSavingTabSwitch] = useState(false);
  const [isDiscardingTab, setIsDiscardingTab] = useState(false);
  const [isSavingBar, setIsSavingBar] = useState(false);
  const [isDiscardingBar, setIsDiscardingBar] = useState(false);
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);

  const loadTabData = useSettingsStore((state) => state.loadTabData);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);

  const isTabVisible = useCallback(
    (tabKey: SettingsTabKey) =>
      tabKey === "media" ? canManageSystem : true,
    [canManageSystem],
  );

  const visibleTabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => isTabVisible(tab.key)),
    [isTabVisible],
  );

  useEffect(() => {
    if (!canManageSystem && rawTab === "media") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("tab");
      nextParams.delete("channel");
      nextParams.delete("subtab");
      setSearchParams(nextParams, { replace: true });
    }
  }, [canManageSystem, rawTab, searchParams, setSearchParams]);

  const dirtyRegistry = useSettingsDirtyRegistry();

  const dirtyEntries = useMemo(() => {
    if (!dirtyRegistry) return [];
    return Object.values(dirtyRegistry.entries).filter(
      (entry) => entry.isDirty && isTabVisible(entry.tab),
    );
  }, [dirtyRegistry, isTabVisible]);

  const activeTabDirtyEntries = useMemo(
    () => dirtyEntries.filter((entry) => entry.tab === activeTab),
    [activeTab, dirtyEntries],
  );

  const dirtyLabels = useMemo(() => {
    const set = new Set<string>();
    for (const entry of dirtyEntries) {
      set.add(entry.label);
    }
    return Array.from(set);
  }, [dirtyEntries]);

  const activeTabDirtyLabels = useMemo(() => {
    const set = new Set<string>();
    for (const entry of activeTabDirtyEntries) {
      set.add(entry.label);
    }
    return Array.from(set);
  }, [activeTabDirtyEntries]);

  const hasAnyDirty = dirtyEntries.length > 0;

  useEffect(() => {
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const commitTab = useCallback(
    (tab: SettingsTabKey) => {
      const resolved = isTabVisible(tab) ? tab : "config";
      if (resolved === activeTab) return;
      const nextParams = new URLSearchParams(searchParams);
      if (resolved === "config") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", resolved);
      }
      nextParams.delete("channel");
      nextParams.delete("subtab");
      setSearchParams(nextParams, { replace: true });
    },
    [activeTab, isTabVisible, searchParams, setSearchParams],
  );

  const selectTab = useCallback(
    (tab: SettingsTabKey) => {
      const resolved = isTabVisible(tab) ? tab : "config";
      if (resolved === activeTab) return;
      if (activeTabDirtyEntries.length > 0) {
        setPendingTab(resolved);
        return;
      }
      commitTab(resolved);
    },
    [activeTab, activeTabDirtyEntries.length, commitTab, isTabVisible],
  );

  useEffect(() => {
    const handleNavigateEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab) {
        selectTab(parseSettingsTab(detail.tab));
      }
    };
    window.addEventListener(SETTINGS_NAVIGATE_TAB_EVENT, handleNavigateEvent);
    return () =>
      window.removeEventListener(
        SETTINGS_NAVIGATE_TAB_EVENT,
        handleNavigateEvent,
      );
  }, [selectTab]);

  const saveEntries = useCallback(
    async (entries: readonly NormalizedDirtyEntry[]): Promise<boolean> => {
      for (const entry of entries) {
        if (entry.validate) {
          const valid = await entry.validate();
          if (!valid) return false;
        }
      }
      for (const entry of entries) {
        if (entry.save) {
          const ok = await entry.save();
          if (!ok) return false;
        }
      }
      return true;
    },
    [],
  );

  const discardEntries = useCallback(
    async (entries: readonly NormalizedDirtyEntry[]): Promise<boolean> => {
      for (const entry of entries) {
        if (entry.discard) {
          const ok = await entry.discard();
          if (!ok) return false;
        }
      }
      return true;
    },
    [],
  );

  const saveAllDirty = useCallback(
    () => saveEntries(dirtyEntries),
    [dirtyEntries, saveEntries],
  );

  const discardAllDirty = useCallback(
    () => discardEntries(dirtyEntries),
    [ dirtyEntries, discardEntries ],
  );

  const routeGuard = useUnsavedRouteGuard({
    when: hasAnyDirty,
    onSave: saveAllDirty,
    onDiscard: discardAllDirty,
  });

  const handleSaveActiveTab = useCallback(async () => {
    if (activeTabDirtyEntries.length === 0 || isSavingBar || isDiscardingBar) {
      return;
    }
    setIsSavingBar(true);
    try {
      await saveEntries(activeTabDirtyEntries);
    } finally {
      setIsSavingBar(false);
    }
  }, [activeTabDirtyEntries, isDiscardingBar, isSavingBar, saveEntries]);

  const handleDiscardActiveTab = useCallback(async () => {
    if (activeTabDirtyEntries.length === 0 || isSavingBar || isDiscardingBar) {
      return;
    }
    setIsDiscardingBar(true);
    try {
      await discardEntries(activeTabDirtyEntries);
    } finally {
      setIsDiscardingBar(false);
    }
  }, [activeTabDirtyEntries, discardEntries, isDiscardingBar, isSavingBar]);

  const handleSaveAndSwitchTab = async () => {
    if (!pendingTab || isSavingTabSwitch || isDiscardingTab) return;
    setIsSavingTabSwitch(true);
    try {
      const ok = await saveEntries(activeTabDirtyEntries);
      if (!ok) return;
      const next = pendingTab;
      setPendingTab(null);
      commitTab(next);
    } finally {
      setIsSavingTabSwitch(false);
    }
  };

  const handleDiscardAndSwitchTab = async () => {
    if (!pendingTab || isSavingTabSwitch || isDiscardingTab) return;
    setIsDiscardingTab(true);
    try {
      const ok = await discardEntries(activeTabDirtyEntries);
      if (!ok) return;
      const next = pendingTab;
      setPendingTab(null);
      commitTab(next);
    } finally {
      setIsDiscardingTab(false);
    }
  };

  const handleRefreshActiveTab = useCallback(async () => {
    if (isRefreshingTab) return;
    setIsRefreshingTab(true);
    const startedAt = Date.now();
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SETTINGS_TAB_REFRESH_EVENT, {
            detail: { tab: activeTab },
          }),
        );
      }
      await loadTabData(activeTab, { force: true, silent: true });
      const elapsed = Date.now() - startedAt;
      if (elapsed < 280) {
        await new Promise((resolve) => setTimeout(resolve, 280 - elapsed));
      }
      toast.success("已刷新当前分组");
    } finally {
      setIsRefreshingTab(false);
    }
  }, [activeTab, isRefreshingTab, loadTabData]);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 pb-8">
      <SettingsDataController />

      <PageHeader
        eyebrow="系统设置"
        title="全局配置与基础设施"
        description={activeMeta.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasAnyDirty ? (
              <Badge variant="warning" className="rounded-full px-3 py-1">
                未保存：{dirtyLabels.join("、")}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={isRefreshingTab || isLoadingConfig}
              onClick={() => void handleRefreshActiveTab()}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (isRefreshingTab || isLoadingConfig) && "animate-spin",
                )}
              />
              刷新当前分组
            </Button>
          </div>
        }
      />

      {/* Mobile / Tablet (<lg) compact horizontal scrollable pill bar */}
      <nav
        aria-label="移动端设置分组"
        className="sticky top-[72px] z-20 rounded-[16px] border border-border/75 bg-card/95 p-1.5 shadow-2xs backdrop-blur lg:hidden"
      >
        <div
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {visibleTabs.map((tab) => {
            const selected = activeTab === tab.key;
            const tabDirty = dirtyEntries.some((entry) => entry.tab === tab.key);
            const TabIcon = SETTINGS_TAB_ICONS[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${tab.key}`}
                onClick={() => selectTab(tab.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors sm:text-[13px]",
                  selected
                    ? "bg-primary/[0.08] font-medium text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <TabIcon className="size-3.5 shrink-0" />
                <span>{tab.label}</span>
                {tabDirty ? (
                  <span
                    aria-label="未保存修改"
                    className="size-2 shrink-0 rounded-full bg-amber-500"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop (lg+) 220px sticky grouped left sidebar + active tab content */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside
          aria-label="设置分组"
          className="hidden lg:sticky lg:top-[84px] lg:block lg:w-[220px] lg:self-start"
        >
          <div
            role="tablist"
            aria-orientation="vertical"
            className="space-y-3 rounded-[16px] border border-border/75 bg-card p-2.5 shadow-2xs"
          >
            {SETTINGS_DOMAIN_GROUPS.map((group) => {
              const groupTabs = group.tabs.filter(isTabVisible);
              if (groupTabs.length === 0) return null;
              return (
                <div
                  key={group.id}
                  className="space-y-1 border-t border-border/55 pt-2.5 first:border-t-0 first:pt-0.5"
                >
                  <div className="px-2.5 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {groupTabs.map((tabKey) => {
                      const tabMeta = getSettingsTabMeta(tabKey);
                      const selected = activeTab === tabKey;
                      const tabDirty = dirtyEntries.some(
                        (entry) => entry.tab === tabKey,
                      );
                      const TabIcon = SETTINGS_TAB_ICONS[tabKey];
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls={`settings-panel-${tabKey}`}
                          onClick={() => selectTab(tabKey)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors",
                            selected
                              ? "bg-primary/[0.08] font-medium text-primary ring-1 ring-primary/20"
                              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <TabIcon
                              className={cn(
                                "size-4 shrink-0",
                                selected
                                  ? "text-primary"
                                  : "text-muted-foreground/80",
                              )}
                            />
                            <span className="truncate">{tabMeta.label}</span>
                          </span>
                          {tabDirty ? (
                            <span
                              aria-label="未保存修改"
                              className="size-2 shrink-0 rounded-full bg-amber-500"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <SettingsTabContent
            activeTab={activeTab}
            canManageSystem={canManageSystem}
          />

          <SettingsStickySaveBar
            dirtyCount={activeTabDirtyEntries.length}
            dirtyLabels={activeTabDirtyLabels}
            isSaving={isSavingBar}
            isDiscarding={isDiscardingBar}
            onSave={() => void handleSaveActiveTab()}
            onDiscard={() => void handleDiscardActiveTab()}
          />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingTab)}
        tone="warning"
        title="当前设置分组有未保存修改"
        description={`「${activeTabDirtyLabels.join("、") || activeMeta.label}」存在未保存更改，是否保存后再切换分组？`}
        confirmLabel="保存并切换"
        pendingLabel="保存中…"
        cancelLabel="继续编辑"
        pending={isSavingTabSwitch}
        secondaryAction={{
          label: "放弃修改并切换",
          variant: "outline",
          pending: isDiscardingTab,
          onClick: () => void handleDiscardAndSwitchTab(),
        }}
        onClose={() => {
          if (!isSavingTabSwitch && !isDiscardingTab) {
            setPendingTab(null);
          }
        }}
        onConfirm={() => void handleSaveAndSwitchTab()}
      />

      <ConfirmDialog
        open={routeGuard.isOpen}
        tone="warning"
        title="设置页面有未保存修改"
        description={`「${dirtyLabels.join("、")}」尚未保存，是否保存后再离开？`}
        confirmLabel="保存并离开"
        pendingLabel="保存中…"
        cancelLabel="留在此页"
        pending={routeGuard.isSaving}
        secondaryAction={{
          label: "放弃修改并离开",
          variant: "outline",
          pending: routeGuard.isDiscarding,
          onClick: () => void routeGuard.confirmDiscardAndLeave(),
        }}
        onClose={routeGuard.cancelLeave}
        onConfirm={() => void routeGuard.confirmSaveAndLeave()}
      />
    </div>
  );
}
