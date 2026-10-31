"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { SettingsConfig } from "@/lib/settings-types";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import { cn } from "@/lib/utils";

import { SettingsHeader } from "./components/settings-header";
import { SettingsSecondaryNav } from "./components/settings-secondary-nav";
import { SettingsDataController } from "./settings-data-controller";
import {
  configSnapshot,
  isConfigKeysDirty,
  registerConfigSnapshot,
} from "./settings-dirty";
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

const TAB_LABEL_MAP: Record<SettingsTabKey, string> = Object.fromEntries(
  SETTINGS_TABS.map((item) => [item.key, item.label]),
) as Record<SettingsTabKey, string>;

const TAB_CONFIG_KEYS: Record<
  SettingsTabKey,
  readonly (keyof SettingsConfig)[]
> = {
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

function scrollAndHighlightSection(sectionId: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(sectionId);
  if (!element || element.offsetParent === null) return false;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  element.setAttribute("data-anchor-flash", "1");
  window.setTimeout(() => {
    element.removeAttribute("data-anchor-flash");
  }, 1100);
  return true;
}

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
  const activeTabMeta = getSettingsTabMeta(activeTab);

  const [pendingTab, setPendingTab] = useState<SettingsTabKey | null>(null);
  const pendingSectionRef = useRef<string | undefined>(undefined);
  const [queuedSectionId, setQueuedSectionId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>(
    activeTabMeta.sections[0]?.id ?? "",
  );
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isSavingExternal, setIsSavingExternal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const registry = useSettingsDirtyRegistry();
  const externalEntries = useMemo(
    () => Object.values(registry?.entries ?? {}),
    [registry?.entries],
  );
  const dirtyExternalEntries = useMemo(
    () => externalEntries.filter((entry) => entry.isDirty),
    [externalEntries],
  );

  const loadTabData = useSettingsStore((state) => state.loadTabData);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const loadRegister = useSettingsStore((state) => state.loadRegister);
  const loadPools = useSettingsStore((state) => state.loadPools);
  const loadLogGovernance = useSettingsStore(
    (state) => state.loadLogGovernance,
  );
  const saveConfig = useSettingsStore((state) => state.saveConfig);
  const saveRegister = useSettingsStore((state) => state.saveRegister);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const isSavingRegister = useSettingsStore((state) => state.isSavingRegister);

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const registerConfig = useSettingsStore((state) => state.registerConfig);
  const savedRegisterSnapshot = useSettingsStore(
    (state) => state.savedRegisterSnapshot,
  );

  const isConfigDirty = Boolean(
    config &&
      savedConfigSnapshot &&
      configSnapshot(config) !== savedConfigSnapshot,
  );
  const isRegisterDirty = Boolean(
    registerConfig &&
      savedRegisterSnapshot &&
      registerConfigSnapshot(registerConfig) !== savedRegisterSnapshot,
  );

  const dirtyTabSet = useMemo(() => {
    const next = new Set<SettingsTabKey>();
    if (isConfigDirty) {
      let matchedSpecificTab = false;
      for (const tab of SETTINGS_TABS) {
        const keys = TAB_CONFIG_KEYS[tab.key];
        if (
          keys.length > 0 &&
          isConfigKeysDirty(config, savedConfigSnapshot, keys)
        ) {
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

  const mountedTabs = useMemo(() => {
    const next = new Set<SettingsTabKey>([activeTab]);
    for (const tab of dirtyTabSet) {
      next.add(tab);
    }
    return Array.from(next);
  }, [activeTab, dirtyTabSet]);

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
        if (
          keys.length > 0 &&
          isConfigKeysDirty(config, savedConfigSnapshot, keys)
        ) {
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

  const hasUnsavedChanges = dirtyModules.length > 0 && canManageSystem;

  useEffect(() => {
    void loadTabData(activeTab);
    setActiveSectionId(getSettingsTabMeta(activeTab).sections[0]?.id ?? "");
  }, [activeTab, loadTabData]);

  useEffect(() => {
    if (!queuedSectionId) return;
    let attempts = 0;
    let timer: number | undefined;
    const tryScroll = () => {
      if (scrollAndHighlightSection(queuedSectionId)) {
        setActiveSectionId(queuedSectionId);
        setQueuedSectionId(null);
        return;
      }
      attempts += 1;
      if (attempts < 14) {
        timer = window.setTimeout(tryScroll, 90);
      } else {
        setQueuedSectionId(null);
      }
    };
    tryScroll();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeTab, queuedSectionId]);

  useEffect(() => {
    const sections = activeTabMeta.sections;
    if (sections.length <= 1 || typeof window === "undefined") return;

    const updateActiveFromScroll = () => {
      const probeY = 140;
      let currentId: string = sections[0]?.id ?? "";
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (!node || node.offsetParent === null) continue;
        if (node.getBoundingClientRect().top <= probeY) {
          currentId = section.id;
        }
      }
      if (currentId) {
        setActiveSectionId((prev) => (prev === currentId ? prev : currentId));
      }
    };

    window.addEventListener("scroll", updateActiveFromScroll, {
      passive: true,
    });
    const rafId = window.requestAnimationFrame(updateActiveFromScroll);
    return () => {
      window.removeEventListener("scroll", updateActiveFromScroll);
      window.cancelAnimationFrame(rafId);
    };
  }, [activeTabMeta.sections]);

  const commitTab = useCallback(
    (tab: SettingsTabKey, sectionId?: string) => {
      if (sectionId) {
        setQueuedSectionId(sectionId);
      }
      if (tab === activeTab) return;
      const nextParams = new URLSearchParams(searchParams);
      if (tab === "base") nextParams.delete("tab");
      else nextParams.set("tab", tab);
      setSearchParams(nextParams, { replace: true });
    },
    [activeTab, searchParams, setSearchParams],
  );

  const navigateToTabAndSection = useCallback(
    (tab: SettingsTabKey, sectionId?: string) => {
      if (tab === activeTab) {
        if (sectionId) {
          setQueuedSectionId(sectionId);
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      if (hasUnsavedChanges) {
        pendingSectionRef.current = sectionId;
        setPendingTab(tab);
        return;
      }
      commitTab(tab, sectionId);
    },
    [activeTab, commitTab, hasUnsavedChanges],
  );

  useEffect(() => {
    const handleSidebarNavigate = (event: Event) => {
      const detail = (
        event as CustomEvent<{ tab?: string; sectionId?: string }>
      ).detail;
      if (!detail?.tab) return;
      navigateToTabAndSection(parseSettingsTab(detail.tab), detail.sectionId);
    };
    window.addEventListener(SETTINGS_NAVIGATE_TAB_EVENT, handleSidebarNavigate);
    return () =>
      window.removeEventListener(
        SETTINGS_NAVIGATE_TAB_EVENT,
        handleSidebarNavigate,
      );
  }, [navigateToTabAndSection]);

  const reloadDirtyModules = useCallback(async () => {
    const results: boolean[] = [];
    if (isConfigDirty) results.push(await loadConfig({ silent: true }));
    if (isRegisterDirty) results.push(await loadRegister({ silent: true }));
    for (const entry of dirtyExternalEntries) {
      if (entry.discard) {
        results.push(Boolean(await entry.discard()));
      }
    }
    return !results.some((result) => !result);
  }, [
    dirtyExternalEntries,
    isConfigDirty,
    isRegisterDirty,
    loadConfig,
    loadRegister,
  ]);

  const handleSaveAllDirty = useCallback(async (): Promise<boolean> => {
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
  }, [
    dirtyExternalEntries,
    dirtyTabSet,
    externalEntries,
    isConfigDirty,
    isRegisterDirty,
    saveConfig,
    saveRegister,
  ]);

  const routeGuard = useUnsavedRouteGuard({
    when: hasUnsavedChanges,
    onSave: handleSaveAllDirty,
    onDiscard: async () => {
      const ok = await reloadDirtyModules();
      if (!ok) {
        toast.error("重新读取服务器配置失败，已保留当前修改");
      }
      return ok;
    },
  });

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
      const section = pendingSectionRef.current;
      pendingSectionRef.current = undefined;
      setPendingTab(null);
      commitTab(next, section);
    } finally {
      setIsDiscarding(false);
    }
  };

  const saveAndSwitch = async () => {
    if (!pendingTab) return;
    const ok = await handleSaveAllDirty();
    if (!ok) return;
    const next = pendingTab;
    const section = pendingSectionRef.current;
    pendingSectionRef.current = undefined;
    setPendingTab(null);
    commitTab(next, section);
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
          }),
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
    <div
      className={cn(
        "w-full min-w-0",
        hasUnsavedChanges ? "pb-28" : "pb-12",
      )}
    >
      <SettingsDataController />

      <div className="flex min-w-0 flex-col gap-5 md:grid md:grid-cols-[204px_minmax(0,1fr)] md:items-start md:gap-6">
        <SettingsSecondaryNav
          activeTab={activeTab}
          activeSectionId={activeSectionId}
          canManageSystem={canManageSystem}
          dirtyTabSet={dirtyTabSet}
          isRefreshing={isRefreshing}
          onRefresh={() => void handleRefreshCurrentTab()}
          onSelectTab={navigateToTabAndSection}
          onSelectSection={(sectionId) => {
            setActiveSectionId(sectionId);
            scrollAndHighlightSection(sectionId);
          }}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <SettingsHeader
            activeTab={activeTab}
            dirtyModules={dirtyModules}
            isRefreshing={isRefreshing}
            onRefresh={() => void handleRefreshCurrentTab()}
          />

          <div className="min-w-0">
            {mountedTabs.map((tab) => {
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
      </div>

      {hasUnsavedChanges ? (
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
        onClose={() => {
          pendingSectionRef.current = undefined;
          setPendingTab(null);
        }}
        onConfirm={() => void saveAndSwitch()}
      />

      <ConfirmDialog
        open={routeGuard.isOpen}
        tone="warning"
        title="离开系统设置前是否保存修改？"
        description={`「${dirtyModules.join("、")}」有尚未保存的配置更改。离开页面后未保存内容将会丢失。`}
        cancelLabel="继续编辑"
        secondaryAction={{
          label: "放弃修改并离开",
          variant: "destructive",
          pending: routeGuard.isDiscarding,
          pendingLabel: "正在放弃…",
          onClick: () => void routeGuard.confirmDiscardAndLeave(),
        }}
        confirmLabel="保存并离开"
        pendingLabel="正在保存…"
        pending={routeGuard.isSaving || isSavingAny}
        onClose={routeGuard.cancelLeave}
        onConfirm={() => void routeGuard.confirmSaveAndLeave()}
      />
    </div>
  );
}
