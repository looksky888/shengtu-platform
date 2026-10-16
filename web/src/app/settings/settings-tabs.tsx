"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { SettingsHeader } from "./components/settings-header";
import { SettingsDataController } from "./settings-data-controller";
import {
  parseSettingsTab,
  SETTINGS_TABS,
  type SettingsTabKey,
} from "./settings-tab-types";
import { SettingsTabContent } from "./settings-tab-content";
import { useSettingsStore } from "./store";
import { configSnapshot, registerConfigSnapshot } from "./settings-dirty";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore((state) => state.savedConfigSnapshot);
  const registerConfig = useSettingsStore((state) => state.registerConfig);
  const savedRegisterSnapshot = useSettingsStore((state) => state.savedRegisterSnapshot);
  const dirtyModules = useMemo(() => {
    const modules: string[] = [];
    if (config && savedConfigSnapshot && configSnapshot(config) !== savedConfigSnapshot) modules.push("系统配置");
    if (registerConfig && savedRegisterSnapshot && registerConfigSnapshot(registerConfig) !== savedRegisterSnapshot) modules.push("注册配置");
    return modules;
  }, [config, savedConfigSnapshot, registerConfig, savedRegisterSnapshot]);

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
      current.includes(activeTab) ? current : [...current, activeTab],
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

  const discardAndSwitch = async () => {
    if (!pendingTab) return;
    setIsDiscarding(true);
    try {
      const results: boolean[] = [];
      if (dirtyModules.includes("系统配置")) results.push(await loadConfig({ silent: true }));
      if (dirtyModules.includes("注册配置")) results.push(await loadRegister({ silent: true }));
      if (results.some((result) => !result)) {
        toast.error("重新读取服务器配置失败，已保留当前修改");
        return;
      }
      setPendingTab(null);
      commitTab(pendingTab);
    } finally {
      setIsDiscarding(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-8">
      <SettingsDataController />
      <SettingsHeader dirtyModules={dirtyModules} />
      <nav
        aria-label="设置分组"
        className="rounded-[22px] border border-border/70 bg-card/90 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur"
      >
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {SETTINGS_TABS.filter((tab) => canManageSystem || tab.key !== "system-update").map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`settings-panel-${tab.key}`}
                onClick={() => selectTab(tab.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${selected ? "bg-[#1456f0] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
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
      <Dialog open={Boolean(pendingTab)} onOpenChange={(open) => { if (!open && !isDiscarding) setPendingTab(null); }}>
        <DialogContent className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>有未保存的修改</DialogTitle>
            <DialogDescription>当前有未保存的{dirtyModules.join("、")}。切换设置分组前请选择继续编辑，或放弃修改并重新读取服务器配置。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingTab(null)} disabled={isDiscarding}>继续编辑</Button>
            <Button type="button" variant="destructive" onClick={() => void discardAndSwitch()} disabled={isDiscarding}>
              {isDiscarding ? <LoaderCircle className="size-4 animate-spin" /> : null}放弃修改并切换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
