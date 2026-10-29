"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  ChevronDown,
  Database,
  FolderInput,
  Globe,
  Image,
  LayoutGrid,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SubNav } from "@/components/ui/sub-nav";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { SettingsHeader } from "./components/settings-header";
import { SettingsDataController } from "./settings-data-controller";
import {
  configSnapshot,
  isConfigKeysDirty,
  registerConfigSnapshot,
} from "./settings-dirty";
import {
  SettingsDirtyRegistryProvider,
} from "./settings-dirty-registry";
import { useSettingsDirtyRegistry } from "./settings-dirty-registry-hooks";
import { SettingsTabContent } from "./settings-tab-content";
import {
  getSettingsDomainForTab,
  parseSettingsTab,
  SETTINGS_DOMAIN_GROUPS,
  SETTINGS_TABS,
  type SettingsDomainId,
  type SettingsTabKey,
} from "./settings-tab-types";
import { useSettingsStore } from "./store";

export const SETTINGS_TAB_REFRESH_EVENT = "shengtu:settings-tab-refresh";

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

const TAB_LABEL_MAP: Record<SettingsTabKey, string> = Object.fromEntries(
  SETTINGS_TABS.map((item) => [item.key, item.label])
) as Record<SettingsTabKey, string>;

const TAB_CONFIG_KEYS: Record<SettingsTabKey, readonly (keyof SettingsConfig)[]> = {
  base: [
    "base_url",
    "canvas_url",
    "login_page_image_url",
    "login_page_image_mode",
    "login_page_image_zoom",
    "login_page_image_position_x",
    "login_page_image_position_y",
    "refresh_account_interval_minute",
    "image_concurrent_limit",
    "image_worker_count",
    "image_queue_capacity",
    "video_worker_count",
    "video_queue_capacity",
    "image_account_concurrency",
    "image_account_schedule",
    "image_parallel_generation",
    "image_task_timeout_seconds",
    "user_default_concurrent_limit",
    "user_default_rpm_limit",
    "api_key_default_rpm_limit",
    "api_key_default_concurrent_limit",
    "api_key_daily_request_limit",
    "image_retention_days",
    "video_retention_days",
    "auto_remove_invalid_accounts",
    "auto_remove_rate_limited_accounts",
  ],
  image: [
    "image_provider",
    "image_default_model",
    "image_internal_model_slug",
    "image_fallback_model_enabled",
    "image_fallback_model_slugs",
    "image_proxy_base_url",
    "image_proxy_api_key",
    "image_proxy_model",
    "image_proxy_models",
    "image_proxy_timeout_seconds",
    "image_proxy_max_retries",
    "image_proxy_download_urls",
    "image_credit_cost_4k",
    "image_credit_cost_2k",
    "image_credit_cost_1080p",
    "gpt_image_2_credit_cost",
    "gpt_image_2_5_credit_cost",
    "gpt_image_2_5_flare_credit_cost",
    "gpt_image_2_5_sunburst_credit_cost",
    "grok_image_credit_cost_1k",
    "grok_image_credit_cost_2k",
    "video_credit_cost_per_second",
  ],
  email: ["registration_enabled"],
  register: [
    "proxy",
    "flaresolverr_url",
    "upstream_clearance_enabled",
    "upstream_clearance_mode",
    "upstream_clearance_timeout_sec",
    "upstream_clearance_refresh_interval",
    "upstream_clearance_warm_up_on_start",
    "image_challenge_cooldown_seconds",
  ],
  imports: [],
  storage: [
    "media_storage_provider",
    "media_auto_cleanup_enabled",
    "media_r2_account_id",
    "media_r2_access_key_id",
    "media_r2_secret_access_key",
    "media_r2_bucket",
    "media_r2_prefix",
    "media_r2_presign_ttl_seconds",
  ],
  announcement: [],
  backup: [],
  maintenance: ["log_retention_days", "log_levels"],
  "system-update": [],
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
  const activeTab = parseSettingsTab(searchParams.get("tab"));
  const [visitedTabs, setVisitedTabs] = useState<SettingsTabKey[]>([activeTab]);
  const [pendingTab, setPendingTab] = useState<SettingsTabKey | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isSavingExternal, setIsSavingExternal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const lastTabByDomainRef = useRef<Partial<Record<SettingsDomainId, SettingsTabKey>>>({
    [getSettingsDomainForTab(activeTab)]: activeTab,
  });

  const registry = useSettingsDirtyRegistry();
  const externalEntries = useMemo(
    () => Object.values(registry?.entries ?? {}),
    [registry?.entries]
  );
  const dirtyExternalEntries = useMemo(
    () => externalEntries.filter((entry) => entry.isDirty),
    [externalEntries]
  );

  const loadTabData = useSettingsStore((state) => state.loadTabData);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const loadRegister = useSettingsStore((state) => state.loadRegister);
  const loadPools = useSettingsStore((state) => state.loadPools);
  const loadLogGovernance = useSettingsStore((state) => state.loadLogGovernance);
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

  const dirtyTabSet = useMemo(() => {
    const next = new Set<SettingsTabKey>();
    if (isConfigDirty) {
      let matchedSpecificTab = false;
      for (const tab of SETTINGS_TABS) {
        const keys = TAB_CONFIG_KEYS[tab.key];
        if (keys.length > 0 && isConfigKeysDirty(config, savedConfigSnapshot, keys)) {
          next.add(tab.key);
          matchedSpecificTab = true;
        }
      }
      if (!matchedSpecificTab) {
        next.add(activeTab);
      }
    }
    if (isRegisterDirty) {
      next.add("register");
    }
    for (const entry of dirtyExternalEntries) {
      next.add(entry.tab);
    }
    return next;
  }, [
    activeTab,
    config,
    dirtyExternalEntries,
    isConfigDirty,
    isRegisterDirty,
    savedConfigSnapshot,
  ]);

  const dirtyModules = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const pushLabel = (label: string) => {
      if (!label || seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    };

    if (isConfigDirty) {
      let addedConfigTab = false;
      for (const tab of SETTINGS_TABS) {
        const keys = TAB_CONFIG_KEYS[tab.key];
        if (keys.length > 0 && isConfigKeysDirty(config, savedConfigSnapshot, keys)) {
          pushLabel(tab.label);
          addedConfigTab = true;
        }
      }
      if (!addedConfigTab) {
        pushLabel("系统配置");
      }
    }
    if (isRegisterDirty) {
      pushLabel("注册清障配置");
    }
    for (const entry of dirtyExternalEntries) {
      pushLabel(entry.label);
    }
    return labels;
  }, [
    config,
    dirtyExternalEntries,
    isConfigDirty,
    isRegisterDirty,
    savedConfigSnapshot,
  ]);

  useEffect(() => {
    lastTabByDomainRef.current[getSettingsDomainForTab(activeTab)] = activeTab;
  }, [activeTab]);

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

  const commitTab = useCallback(
    (tab: SettingsTabKey) => {
      if (tab === activeTab) return;
      const nextParams = new URLSearchParams(searchParams);
      if (tab === "base") nextParams.delete("tab");
      else nextParams.set("tab", tab);
      setSearchParams(nextParams, { replace: true });
    },
    [activeTab, searchParams, setSearchParams]
  );

  const selectTab = useCallback(
    (tab: SettingsTabKey) => {
      if (tab === activeTab) return;
      if (dirtyModules.length > 0 && canManageSystem) {
        setPendingTab(tab);
        return;
      }
      commitTab(tab);
    },
    [activeTab, canManageSystem, commitTab, dirtyModules.length]
  );

  const activeDomainId = getSettingsDomainForTab(activeTab);
  const activeDomain =
    SETTINGS_DOMAIN_GROUPS.find((group) => group.id === activeDomainId) ??
    SETTINGS_DOMAIN_GROUPS[0];

  const selectDomain = useCallback(
    (domainId: SettingsDomainId) => {
      if (domainId === activeDomainId) return;
      const group = SETTINGS_DOMAIN_GROUPS.find((item) => item.id === domainId);
      if (!group || group.tabs.length === 0) return;
      const targetTab = lastTabByDomainRef.current[domainId] ?? group.tabs[0];
      selectTab(targetTab);
    },
    [activeDomainId, selectTab]
  );

  const reloadDirtyModules = async () => {
    const results: boolean[] = [];
    if (isConfigDirty) results.push(await loadConfig({ silent: true }));
    if (isRegisterDirty) results.push(await loadRegister({ silent: true }));
    for (const entry of dirtyExternalEntries) {
      if (entry.discard) {
        results.push(Boolean(await entry.discard()));
      }
    }
    return !results.some((result) => !result);
  };

  const handleSaveAllDirty = async (): Promise<boolean> => {
    for (const entry of externalEntries) {
      if (!entry.validate) continue;
      if (entry.isDirty || (isConfigDirty && dirtyTabSet.has(entry.tab))) {
        const valid = await entry.validate();
        if (!valid) return false;
      }
    }

    if (isConfigDirty) {
      const ok = await saveConfig();
      if (!ok) return false;
    }
    if (isRegisterDirty) {
      const ok = await saveRegister();
      if (!ok) return false;
    }
    if (dirtyExternalEntries.length > 0) {
      setIsSavingExternal(true);
      try {
        for (const entry of dirtyExternalEntries) {
          if (entry.save) {
            const ok = await entry.save();
            if (!ok) return false;
          }
        }
      } finally {
        setIsSavingExternal(false);
      }
    }
    return true;
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
      const next = pendingTab;
      setPendingTab(null);
      commitTab(next);
    } finally {
      setIsDiscarding(false);
    }
  };

  const saveAndSwitch = async () => {
    if (!pendingTab) return;
    const ok = await handleSaveAllDirty();
    if (!ok) return;
    const next = pendingTab;
    setPendingTab(null);
    commitTab(next);
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

  const handleRefreshCurrentTab = async () => {
    if (dirtyTabSet.has(activeTab)) {
      toast.warning("当前分组有未保存的修改，请先保存或放弃修改后再刷新");
      return;
    }
    setIsRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (
        activeTab === "base" ||
        activeTab === "image" ||
        activeTab === "email" ||
        activeTab === "register" ||
        activeTab === "storage" ||
        activeTab === "maintenance"
      ) {
        tasks.push(loadConfig({ silent: true }));
      }
      if (activeTab === "register") {
        tasks.push(loadRegister({ silent: true }));
      }
      if (activeTab === "imports") {
        tasks.push(loadPools({ silent: true }));
      }
      if (activeTab === "maintenance") {
        tasks.push(loadLogGovernance({ silent: true }));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SETTINGS_TAB_REFRESH_EVENT, {
            detail: { tab: activeTab },
          })
        );
      }
      await Promise.all(tasks);
      toast.success(`已刷新「${TAB_LABEL_MAP[activeTab]}」最新状态`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isSavingAny = isSavingConfig || isSavingRegister || isSavingExternal;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 pb-20">
      <SettingsDataController />
      <SettingsHeader
        dirtyModules={dirtyModules}
        isRefreshing={isRefreshing}
        onRefresh={() => void handleRefreshCurrentTab()}
      />

      <div className="sticky top-14 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border/75 bg-stage/92 px-2 py-1.5 shadow-2xs backdrop-blur-md">
        <SubNav
          ariaLabel="设置领域分组"
          size="sm"
          value={activeDomainId}
          onValueChange={selectDomain}
          layoutId="settings-domain-nav"
          items={SETTINGS_DOMAIN_GROUPS.map((group) => ({
            value: group.id,
            label: group.label,
            dot: group.tabs.some((tabKey) => dirtyTabSet.has(tabKey)),
            dotTone: "warning" as const,
          }))}
        />

        <span
          aria-hidden="true"
          className="hidden h-5 w-px shrink-0 bg-border/80 md:block"
        />

        <SubNav
          ariaLabel="当前领域子设置项"
          size="sm"
          value={activeTab}
          onValueChange={selectTab}
          layoutId={`settings-subnav-${activeDomainId}`}
          className="bg-transparent p-0 dark:bg-transparent"
          items={activeDomain.tabs.map((tabKey) => ({
            value: tabKey,
            label: TAB_LABEL_MAP[tabKey],
            icon: TAB_ICON_MAP[tabKey],
            dot: dirtyTabSet.has(tabKey),
            dotTone: "warning" as const,
          }))}
        />

        <div className="ml-auto flex shrink-0 items-center">
          <Popover open={quickJumpOpen} onOpenChange={setQuickJumpOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">全部 {SETTINGS_TABS.length} 项</span>
                <span className="sm:hidden">全部</span>
                {dirtyTabSet.size > 0 ? (
                  <span
                    aria-label={`${dirtyTabSet.size} 个分组有未保存修改`}
                    className="size-1.5 rounded-full bg-status-warning"
                  />
                ) : null}
                <ChevronDown className="size-3 opacity-70" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border/80 bg-surface p-3 shadow-lg"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-foreground">
                  系统设置索引（共 {SETTINGS_TABS.length} 项）
                </span>
                <span className="text-[11px] text-muted-foreground">
                  点击快速跳转
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SETTINGS_DOMAIN_GROUPS.map((group) => (
                  <div
                    key={group.id}
                    className="space-y-1 rounded-lg border border-border/60 bg-surface-subtle/40 p-2"
                  >
                    <div className="px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.tabs.map((tabKey) => {
                      const Icon = TAB_ICON_MAP[tabKey];
                      const active = tabKey === activeTab;
                      const isTabDirty = dirtyTabSet.has(tabKey);
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => {
                            setQuickJumpOpen(false);
                            selectTab(tabKey);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                            active
                              ? "bg-surface text-foreground shadow-2xs ring-1 ring-border/75"
                              : "text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon className="size-3.5 shrink-0" />
                            <span className="truncate">
                              {TAB_LABEL_MAP[tabKey]}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {isTabDirty ? (
                              <span
                                title="未保存修改"
                                className="size-1.5 rounded-full bg-status-warning"
                              />
                            ) : null}
                            {active ? (
                              <Check className="size-3.5 text-foreground" />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
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
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(42rem,calc(100vw-1.5rem))] items-center justify-between gap-3 rounded-xl border border-status-warning/35 bg-surface/95 px-4 py-3 shadow-xl backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-foreground sm:text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-status-warning-soft text-status-warning">
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
              variant="default"
              size="sm"
              loading={isSavingAny}
              disabled={isDiscarding}
              onClick={() => void handleSaveAllDirty()}
            >
              <Save className="size-3.5" />
              <span>保存全部修改</span>
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingTab)}
        tone="warning"
        title="当前设置分组存在未保存修改"
        description={
          pendingTab
            ? `即将切换到「${TAB_LABEL_MAP[pendingTab]}」，但「${dirtyModules.join("、")}」尚未保存。您可以直接保存并切换，或放弃未保存更改。`
            : ""
        }
        cancelLabel="继续编辑"
        secondaryAction={{
          label: "放弃修改并切换",
          variant: "destructive",
          pending: isDiscarding,
          pendingLabel: "正在放弃…",
          onClick: () => void discardAndSwitch(),
        }}
        confirmLabel="保存并切换"
        pendingLabel="正在保存…"
        pending={isSavingAny}
        onClose={() => setPendingTab(null)}
        onConfirm={() => void saveAndSwitch()}
      />
    </div>
  );
}
