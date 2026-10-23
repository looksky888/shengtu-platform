"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArchiveRestore,
  Database,
  FolderInput,
  Globe,
  Image,
  Mail,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SubNav } from "@/components/ui/sub-nav";

import { SettingsHeader } from "./components/settings-header";
import { SettingsDataController } from "./settings-data-controller";
import { configSnapshot, registerConfigSnapshot } from "./settings-dirty";
import { SettingsTabContent } from "./settings-tab-content";
import {
  parseSettingsTab,
  SETTINGS_TABS,
  type SettingsTabKey,
} from "./settings-tab-types";
import { useSettingsStore } from "./store";

const TAB_ICON_MAP: Record<SettingsTabKey, LucideIcon> = {
  base: SlidersHorizontal,
  image: Image,
  storage: Database,
  email: Mail,
  register: Globe,
  imports: FolderInput,
  announcement: Megaphone,
  backup: ArchiveRestore,
  maintenance: Wrench,
  "system-update": RefreshCw,
};

export function SettingsTabs({
  canManageSystem,
}: {
  canManageSystem: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseSettingsTab(searchParams.get("tab"));
  const [visitedTabs, setVisitedTabs] = useState<SettingsTabKey[]>([activeTab]);
  const [pendingTab, setPendingTab] = useState<SettingsTabKey | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const loadTabData = useSettingsStore((state) => state.loadTabData);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const loadRegister = useSettingsStore((state) => state.loadRegister);
  const saveConfig = useSettingsStore((state) => state.saveConfig);
  const saveRegister = useSettingsStore((state) => state.saveRegister);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const isSavingRegister = useSettingsStore((state) => state.isSavingRegister);

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const registerConfig = useSettingsStore((state) => state.registerConfig);
  const savedRegisterSnapshot = useSettingsStore(
    (state) => state.savedRegisterSnapshot
  );

  const isConfigDirty = Boolean(
    config &&
      savedConfigSnapshot &&
      configSnapshot(config) !== savedConfigSnapshot
  );
  const isRegisterDirty = Boolean(
    registerConfig &&
      savedRegisterSnapshot &&
      registerConfigSnapshot(registerConfig) !== savedRegisterSnapshot
  );

  const dirtyModules = useMemo(() => {
    const modules: string[] = [];
    if (isConfigDirty) modules.push("系统配置");
    if (isRegisterDirty) modules.push("注册配置");
    return modules;
  }, [isConfigDirty, isRegisterDirty]);

  useEffect(() => {
    if (!dirtyModules.length) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyModules.length]);

  useEffect(() => {
    setVisitedTabs((current) =>
      current.includes(activeTab) ? current : [...current, activeTab]
    );
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const commitTab = (tab: SettingsTabKey) => {
    if (tab === activeTab) return;
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "base") nextParams.delete("tab");
    else nextParams.set("tab", tab);
    setSearchParams(nextParams, { replace: true });
  };

  const selectTab = (tab: SettingsTabKey) => {
    if (tab === activeTab) return;
    if (dirtyModules.length) {
      setPendingTab(tab);
      return;
    }
    commitTab(tab);
  };

  const reloadDirtyModules = async () => {
    const results: boolean[] = [];
    if (isConfigDirty) results.push(await loadConfig({ silent: true }));
    if (isRegisterDirty) results.push(await loadRegister({ silent: true }));
    return !results.some((result) => !result);
  };

  const discardAndSwitch = async () => {
    if (!pendingTab) return;
    setIsDiscarding(true);
    try {
      const ok = await reloadDirtyModules();
      if (!ok) {
        toast.error("重新读取服务器配置失败，已保留当前修改");
        return;
      }
      setPendingTab(null);
      commitTab(pendingTab);
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleDiscardCurrent = async () => {
    setIsDiscarding(true);
    try {
      const ok = await reloadDirtyModules();
      if (ok) {
        toast.success("已放弃未保存的修改");
      } else {
        toast.error("重新读取服务器配置失败");
      }
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleSaveAllDirty = async () => {
    if (isConfigDirty) {
      await saveConfig();
    }
    if (isRegisterDirty) {
      await saveRegister();
    }
  };

  const isSavingAny = isSavingConfig || isSavingRegister;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 pb-20">
      <SettingsDataController />
      <SettingsHeader dirtyModules={dirtyModules} />

      <div className="sticky top-0 z-20 -mx-1 bg-background/90 px-1 py-1 backdrop-blur-md">
        <SubNav
          ariaLabel="设置分组导航"
          value={activeTab}
          onValueChange={selectTab}
          layoutId="settings-subnav"
          items={SETTINGS_TABS.map((tab) => {
            const tabDirty =
              (tab.key === "register" && isRegisterDirty) ||
              (activeTab === tab.key && (isConfigDirty || isRegisterDirty));
            return {
              value: tab.key,
              label: tab.label,
              icon: TAB_ICON_MAP[tab.key],
              badge: tabDirty ? (
                <span
                  aria-label="未保存修改"
                  className="inline-block size-1.5 rounded-full bg-status-warning"
                />
              ) : undefined,
            };
          })}
        />
      </div>

      <div className="min-w-0">
        {visitedTabs.map((tab) => {
          const active = tab === activeTab;
          return (
            <div
              key={tab}
              id={`settings-panel-${tab}`}
              role="tabpanel"
              aria-hidden={!active}
              hidden={!active}
            >
              <SettingsTabContent
                active={active}
                canManageSystem={canManageSystem}
                tab={tab}
              />
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Unsaved Changes Bar */}
      {dirtyModules.length > 0 && canManageSystem ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(42rem,calc(100vw-1.5rem))] items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-surface-raised/95 px-4 py-3 shadow-xl backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-foreground sm:text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" />
            </span>
            <span className="truncate">
              未保存的修改：
              <strong className="font-semibold">
                {dirtyModules.join("、")}
              </strong>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isDiscarding}
              disabled={isSavingAny}
              onClick={() => void handleDiscardCurrent()}
            >
              <RotateCcw className="size-3.5" />
              <span>放弃</span>
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              loading={isSavingAny}
              disabled={isDiscarding}
              onClick={() => void handleSaveAllDirty()}
            >
              <Save className="size-3.5" />
              <span>保存修改</span>
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingTab)}
        tone="warning"
        title="有未保存的修改"
        description={`当前有未保存的${dirtyModules.join("、")}。切换设置分组前请选择继续编辑，或放弃修改并重新读取服务器配置。`}
        cancelLabel="继续编辑"
        confirmLabel="放弃修改并切换"
        destructive
        pending={isDiscarding}
        onClose={() => setPendingTab(null)}
        onConfirm={() => void discardAndSwitch()}
      />
    </div>
  );
}
