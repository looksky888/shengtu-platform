"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import { cn } from "@/lib/utils";

import { SettingsDataController } from "./settings-data-controller";
import { configSnapshot } from "./settings-dirty";
import { SettingsDirtyRegistryProvider } from "./settings-dirty-registry";
import { useSettingsDirtyRegistry } from "./settings-dirty-registry-hooks";
import { SettingsTabContent } from "./settings-tab-content";
import {
  getSettingsTabMeta,
  parseSettingsTab,
  SETTINGS_NAVIGATE_TAB_EVENT,
  SETTINGS_TABS,
  type SettingsTabKey,
} from "./settings-tab-types";
import { useSettingsStore } from "./store";

export const SETTINGS_TAB_REFRESH_EVENT = "shengtu:settings-tab-refresh";

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
  const activeTab = parseSettingsTab(searchParams.get("tab"));
  const activeMeta = getSettingsTabMeta(activeTab);

  const [visitedTabs, setVisitedTabs] = useState<SettingsTabKey[]>([activeTab]);
  const [pendingTab, setPendingTab] = useState<SettingsTabKey | null>(null);
  const [isDiscardingTab, setIsDiscardingTab] = useState(false);

  const loadTabData = useSettingsStore((state) => state.loadTabData);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const pendingLoginImageFile = useSettingsStore(
    (state) => state.pendingLoginImageFile,
  );
  const discardPendingLoginPageImage = useSettingsStore(
    (state) => state.discardPendingLoginPageImage,
  );

  const dirtyRegistry = useSettingsDirtyRegistry();

  const dirtyEntries = useMemo(() => {
    if (!dirtyRegistry) return [];
    return Object.values(dirtyRegistry.entries).filter((entry) => entry.isDirty);
  }, [dirtyRegistry]);

  const isStoreConfigDirty = Boolean(
    pendingLoginImageFile ||
      (config &&
        savedConfigSnapshot &&
        configSnapshot(config) !== savedConfigSnapshot),
  );

  const dirtyLabels = useMemo(() => {
    const set = new Set<string>();
    for (const entry of dirtyEntries) {
      set.add(entry.label);
    }
    if (isStoreConfigDirty && set.size === 0) {
      set.add("系统配置");
    }
    return Array.from(set);
  }, [dirtyEntries, isStoreConfigDirty]);

  const hasAnyDirty = dirtyLabels.length > 0;

  useEffect(() => {
    setVisitedTabs((current) =>
      current.includes(activeTab) ? current : [...current, activeTab],
    );
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const commitTab = useCallback(
    (tab: SettingsTabKey) => {
      if (tab === activeTab) return;
      const nextParams = new URLSearchParams(searchParams);
      if (tab === "config") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", tab);
      }
      nextParams.delete("channel");
      nextParams.delete("subtab");
      setSearchParams(nextParams, { replace: true });
    },
    [activeTab, searchParams, setSearchParams],
  );

  const selectTab = useCallback(
    (tab: SettingsTabKey) => {
      if (tab === activeTab) return;
      const activeTabDirty = dirtyEntries.some((entry) => entry.tab === activeTab);
      if (activeTabDirty || (activeTab === "config" && isStoreConfigDirty)) {
        setPendingTab(tab);
        return;
      }
      commitTab(tab);
    },
    [activeTab, commitTab, dirtyEntries, isStoreConfigDirty],
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
      window.removeEventListener(SETTINGS_NAVIGATE_TAB_EVENT, handleNavigateEvent);
  }, [selectTab]);

  const discardAllDirty = useCallback(async (): Promise<boolean> => {
    for (const entry of dirtyEntries) {
      if (entry.discard) {
        const ok = await entry.discard();
        if (!ok) return false;
      }
    }
    if (pendingLoginImageFile) {
      discardPendingLoginPageImage();
    }
    if (isStoreConfigDirty) {
      const reloaded = await loadConfig({ silent: true });
      if (!reloaded) {
        toast.error("重新读取服务器配置失败，已保留当前修改");
        return false;
      }
    }
    return true;
  }, [
    dirtyEntries,
    discardPendingLoginPageImage,
    isStoreConfigDirty,
    loadConfig,
    pendingLoginImageFile,
  ]);

  const saveAllDirty = useCallback(async (): Promise<boolean> => {
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

  const routeGuard = useUnsavedRouteGuard({
    when: hasAnyDirty,
    onSave: saveAllDirty,
    onDiscard: discardAllDirty,
  });

  const handleDiscardAndSwitchTab = async () => {
    if (!pendingTab) return;
    setIsDiscardingTab(true);
    try {
      const ok = await discardAllDirty();
      if (!ok) return;
      const next = pendingTab;
      setPendingTab(null);
      commitTab(next);
    } finally {
      setIsDiscardingTab(false);
    }
  };

  const handleRefreshActiveTab = () => {
    void loadTabData(activeTab);
    if (
      activeTab === "config" ||
      activeTab === "channels" ||
      activeTab === "proxy" ||
      activeTab === "email" ||
      activeTab === "media"
    ) {
      void loadConfig({ silent: true });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(SETTINGS_TAB_REFRESH_EVENT, {
          detail: { tab: activeTab },
        }),
      );
    }
  };

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
              disabled={isLoadingConfig}
              onClick={handleRefreshActiveTab}
            >
              <RefreshCw
                className={cn("size-3.5", isLoadingConfig && "animate-spin")}
              />
              刷新当前分组
            </Button>
          </div>
        }
      />

      <nav
        aria-label="设置分组"
        className="sticky top-[72px] z-20 rounded-[22px] border border-border/75 bg-card/95 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur"
      >
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {SETTINGS_TABS.map((tab) => {
            const selected = activeTab === tab.key;
            const tabDirty = dirtyEntries.some((entry) => entry.tab === tab.key);
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${tab.key}`}
                onClick={() => selectTab(tab.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "bg-[#1456f0] text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                {tabDirty ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      selected ? "bg-white" : "bg-amber-500",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <SettingsTabContent
        activeTab={activeTab}
        visitedTabs={visitedTabs}
        canManageSystem={canManageSystem}
      />

      <ConfirmDialog
        open={Boolean(pendingTab)}
        tone="warning"
        title="当前设置分组有未保存修改"
        description={`「${dirtyLabels.join("、") || activeMeta.label}」存在未保存更改，切换分组将放弃未保存内容。`}
        confirmLabel="放弃修改并切换"
        pendingLabel="处理中…"
        cancelLabel="继续编辑"
        pending={isDiscardingTab}
        onClose={() => setPendingTab(null)}
        onConfirm={() => void handleDiscardAndSwitchTab()}
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
