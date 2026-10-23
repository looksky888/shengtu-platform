"use client";

import { PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchProxyRuntime,
  testProxy,
  testProxyClearance,
  warmUpProxyClearance,
  type ClearanceTestResult,
  type ProxyRuntimeStatus,
  type ProxyTestResult,
} from "@/lib/api";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { isConfigKeysDirty } from "../settings-dirty";
import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsEmptyState,
} from "./settings-ui";
import {
  type UpstreamClearanceMode,
  UpstreamProxyRuntimeForm,
} from "./upstream-proxy-runtime-form";
import { UpstreamProxyRuntimeStatus } from "./upstream-proxy-runtime-status";

const UPSTREAM_PROXY_KEYS: readonly (keyof SettingsConfig)[] = [
  "proxy",
  "flaresolverr_url",
  "upstream_clearance_enabled",
  "upstream_clearance_mode",
  "upstream_clearance_timeout_sec",
  "upstream_clearance_refresh_interval",
  "upstream_clearance_warm_up_on_start",
  "image_challenge_cooldown_seconds",
];

function badgeModeText(enabled: boolean, mode: UpstreamClearanceMode): string {
  if (!enabled || mode === "none") return "清障未启用";
  if (mode === "flaresolverr") return "FlareSolverr 自动过盾";
  return "手动凭据复用";
}

export function UpstreamProxyRuntimeCard() {
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [isTestingClearance, setIsTestingClearance] = useState(false);
  const [isWarming, setIsWarming] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null);
  const [clearanceResult, setClearanceResult] =
    useState<ClearanceTestResult | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<ProxyRuntimeStatus | null>(
    null
  );
  const [targetUrl, setTargetUrl] = useState("https://chatgpt.com");

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );
  const setProxy = useSettingsStore((state) => state.setProxy);
  const setUpstreamClearanceField = useSettingsStore(
    (state) => state.setUpstreamClearanceField
  );

  const loadRuntimeStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const data = await fetchProxyRuntime();
      setRuntimeStatus(data.status || null);
    } catch (error) {
      if (!silent) {
        toast.error(
          error instanceof Error ? error.message : "加载代理运行时状态失败"
        );
      }
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadRuntimeStatus(true);
  }, [loadRuntimeStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === "register") {
        void loadRuntimeStatus(true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
  }, [loadRuntimeStatus]);

  if (isLoadingConfig) {
    return (
      <SettingsCard
        icon={PlugZap}
        title="生图上游代理与 WARP 清障"
        description="统一管理本地号池出站代理及 FlareSolverr 过盾会话缓存"
      >
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-18 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </SettingsCard>
    );
  }

  if (!config) {
    return (
      <SettingsCard
        icon={PlugZap}
        title="生图上游代理与 WARP 清障"
        description="统一管理本地号池出站代理及 FlareSolverr 过盾会话缓存"
      >
        <SettingsEmptyState
          icon={PlugZap}
          title="上游代理配置加载失败"
          description="未能从服务端获取全局代理与清障参数，请点击下方按钮重试。"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadConfig()}
            >
              <RefreshCw className="size-3.5" />
              <span>重新加载配置</span>
            </Button>
          }
        />
      </SettingsCard>
    );
  }

  const enabled = Boolean(config.upstream_clearance_enabled);
  const mode = (
    config.upstream_clearance_mode === "flaresolverr" ||
    config.upstream_clearance_mode === "manual"
      ? config.upstream_clearance_mode
      : "none"
  ) as UpstreamClearanceMode;
  const warmUp = Boolean(config.upstream_clearance_warm_up_on_start);

  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    UPSTREAM_PROXY_KEYS
  );
  const isSavingSection =
    isSavingConfig &&
    (savingSectionKey === "upstream-proxy" || savingSectionKey === "__all__");

  const handleTestProxy = async () => {
    const candidate = String(config.proxy || "").trim();
    if (!candidate) {
      toast.error("请先填写代理服务地址（如 http://privoxy:8118）");
      return;
    }
    setIsTestingProxy(true);
    setProxyResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyResult(data.result);
      if (data.result.ok) {
        toast.success(
          `代理连通可用：${data.result.latency_ms} ms，HTTP ${data.result.status}`
        );
      } else {
        toast.error(`代理不可用：${data.result.error ?? "未知错误"}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试代理失败");
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handleTestClearance = async () => {
    setIsTestingClearance(true);
    setClearanceResult(null);
    try {
      if (sectionDirty) {
        const saved = await saveConfigSection(UPSTREAM_PROXY_KEYS, {
          sectionKey: "upstream-proxy",
          silentToast: true,
        });
        if (!saved) return;
      }
      const data = await testProxyClearance(
        targetUrl.trim() || "https://chatgpt.com"
      );
      setClearanceResult(data.result);
      if (data.result.ok) {
        toast.success(
          `Clearance 验证成功（${data.result.latency_ms} ms，${data.result.cookie_count ?? 0} 枚 Cookie）`
        );
      } else {
        toast.error(
          `Clearance 验证失败：${data.result.error ?? data.result.status}`
        );
      }
      await loadRuntimeStatus(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "测试 Clearance 失败"
      );
    } finally {
      setIsTestingClearance(false);
    }
  };

  const handleWarmUp = async () => {
    setIsWarming(true);
    try {
      if (sectionDirty) {
        const saved = await saveConfigSection(UPSTREAM_PROXY_KEYS, {
          sectionKey: "upstream-proxy",
          silentToast: true,
        });
        if (!saved) return;
      }
      const data = await warmUpProxyClearance();
      setRuntimeStatus(data.status || null);
      if (data.result?.ok) {
        toast.success("上游 Clearance 缓存预热成功");
      } else {
        toast.error(
          String(data.result?.error || data.result?.status || "预热失败")
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预热失败");
    } finally {
      setIsWarming(false);
    }
  };

  return (
    <SettingsCard
      icon={PlugZap}
      title="生图上游代理与 WARP 清障"
      description="统一管理本地号池出站代理及 FlareSolverr 过盾会话缓存"
      meta={
        <Badge
          variant="outline"
          className={cn(
            "h-5 gap-1.5 px-2 text-[11px]",
            enabled && mode !== "none"
              ? "border-status-success/25 bg-status-success-soft font-medium text-status-success"
              : "border-border/75 bg-surface-subtle text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              enabled && mode !== "none"
                ? "bg-status-success"
                : "bg-muted-foreground/60"
            )}
          />
          {badgeModeText(enabled, mode)}
        </Badge>
      }
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadRuntimeStatus()}
          disabled={isLoadingStatus}
          className="h-8 gap-1.5 px-2.5 text-xs"
        >
          <RefreshCw
            className={cn("size-3.5", isLoadingStatus && "animate-spin")}
          />
          <span>刷新缓存状态</span>
        </Button>
      }
      footer={
        <SettingsCardSaveFooter
          dirty={sectionDirty}
          saving={isSavingSection}
          disabled={isSavingConfig || isTestingClearance || isWarming}
          onReset={() => resetConfigSection(UPSTREAM_PROXY_KEYS)}
          onSave={() =>
            void saveConfigSection(UPSTREAM_PROXY_KEYS, {
              sectionKey: "upstream-proxy",
            })
          }
        />
      }
    >
      <div className="space-y-5">
        <UpstreamProxyRuntimeStatus
          config={config}
          runtimeStatus={runtimeStatus}
        />
        <UpstreamProxyRuntimeForm
          config={config}
          enabled={enabled}
          mode={mode}
          warmUp={warmUp}
          targetUrl={targetUrl}
          isTestingProxy={isTestingProxy}
          isTestingClearance={isTestingClearance}
          isWarming={isWarming}
          proxyResult={proxyResult}
          clearanceResult={clearanceResult}
          onProxyChange={(value) => {
            setProxy(value);
            setProxyResult(null);
          }}
          onFieldChange={setUpstreamClearanceField}
          onTargetUrlChange={setTargetUrl}
          onTestProxy={() => void handleTestProxy()}
          onTestClearance={() => void handleTestClearance()}
          onWarmUp={() => void handleWarmUp()}
        />
      </div>
    </SettingsCard>
  );
}
