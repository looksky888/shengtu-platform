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
import { cn } from "@/lib/utils";

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
};

const SETTINGS_NAV_GROUPS: Array<{
  title: string;
  keys: readonly SettingsTabKey[];
}> = [
  {
    title: "基础与创作",
    keys: ["base", "image", "storage"],
  },
  {
    title: "注册与号池",
    keys: ["email", "register", "imports"],
  },
  {
    title: "运营与维护",
    keys: ["announcement", "backup", "maintenance"],
  },
];

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
  const tabLabelMap = useMemo(
    () => new Map(SETTINGS_TABS.map((t) => [t.key, t.label])),
    []
  );

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-20">
      <SettingsDataController />
      <SettingsHeader dirtyModules={dirtyModules} />

      {/* Mobile horizontal SubNav */}
      <div className="lg:hidden">
        <SubNav
          ariaLabel="设置分组"
          value={activeTab}
          onValueChange={selectTab}
          layoutId="settings-mobile-subnav"
          items={SETTINGS_TABS.map((tab) => ({
            value: tab.key,
            label: tab.label,
            icon: TAB_ICON_MAP[tab.key],
          }))}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[224px_minmax(0,1fr)]">
        {/* Desktop left grouped vertical navigation */}
        <aside
          aria-label="设置分组导航"
          className="sticky top-18 hidden rounded-2xl border border-border/80 bg-surface p-2.5 shadow-2xs lg:block"
        >
          <div className="space-y-4" role="tablist" aria-orientation="vertical">
            {SETTINGS_NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80">
                  {group.title}
                </div>
                {group.keys.map((key) => {
                  const selected = activeTab === key;
                  const Icon = TAB_ICON_MAP[key];
                  const label = tabLabelMap.get(key) ?? key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`settings-panel-${key}`}
                      onClick={() => selectTab(key)}
                      className={cn(
                        "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors",
                        selected
                          ? "border border-brand-border bg-brand-soft font-semibold text-brand"
                          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          selected ? "text-brand" : "text-muted-foreground"
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Settings Tab Panels */}
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
      </div>

      {/* Sticky Bottom Unsaved Changes Bar */}
      {dirtyModules.length > 0 && canManageSystem ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(42rem,calc(100vw-1.5rem))] items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-surface-raised/95 px-4 py-3 shadow-xl backdrop-blur-xl">
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
