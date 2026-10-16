"use client";

import { LoaderCircle, PlugZap, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchProxyRuntime,
  testProxy,
  testProxyClearance,
  warmUpProxyClearance,
  type ClearanceTestResult,
  type ProxyRuntimeStatus,
  type ProxyTestResult,
} from "@/lib/api";

import { useSettingsStore } from "../store";
import {
  type UpstreamClearanceMode,
  UpstreamProxyRuntimeForm,
} from "./upstream-proxy-runtime-form";
import { UpstreamProxyRuntimeStatus } from "./upstream-proxy-runtime-status";
import { SettingsCard } from "./settings-ui";

export function UpstreamProxyRuntimeCard() {
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [isTestingClearance, setIsTestingClearance] = useState(false);
  const [isWarming, setIsWarming] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null);
  const [clearanceResult, setClearanceResult] = useState<ClearanceTestResult | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<ProxyRuntimeStatus | null>(null);
  const [targetUrl, setTargetUrl] = useState("https://chatgpt.com");

  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const setProxy = useSettingsStore((state) => state.setProxy);
  const setUpstreamClearanceField = useSettingsStore((state) => state.setUpstreamClearanceField);

  const loadRuntimeStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const data = await fetchProxyRuntime();
      setRuntimeStatus(data.status || null);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "加载代理运行时状态失败");
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadRuntimeStatus(true);
  }, [loadRuntimeStatus]);

  if (isLoadingConfig || !config) {
    return (
      <SettingsCard icon={PlugZap} title="稳定代理 / WARP 清障" tone="blue">
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  const enabled = Boolean(config.upstream_clearance_enabled);
  const mode = (config.upstream_clearance_mode || "none") as UpstreamClearanceMode;
  const warmUp = Boolean(config.upstream_clearance_warm_up_on_start);

  const handleTestProxy = async () => {
    const candidate = String(config.proxy || "").trim();
    if (!candidate) {
      toast.error("请先填写代理 URL（如 http://privoxy:8118）");
      return;
    }
    setIsTestingProxy(true);
    setProxyResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyResult(data.result);
      if (data.result.ok) toast.success(`代理可用：${data.result.latency_ms} ms，HTTP ${data.result.status}`);
      else toast.error(`代理不可用：${data.result.error ?? "未知错误"}`);
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
      const saved = await saveConfigSection(["proxy", "flaresolverr_url", "upstream_clearance_enabled", "upstream_clearance_mode", "upstream_clearance_timeout_sec", "upstream_clearance_refresh_interval", "upstream_clearance_warm_up_on_start", "image_challenge_cooldown_seconds"]);
      if (!saved) return;
      const data = await testProxyClearance(targetUrl.trim() || "https://chatgpt.com");
      setClearanceResult(data.result);
      if (data.result.ok) toast.success(`Clearance 成功（${data.result.latency_ms} ms，${data.result.cookie_count ?? 0} cookies）`);
      else toast.error(`Clearance 失败：${data.result.error ?? data.result.status}`);
      await loadRuntimeStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试 Clearance 失败");
    } finally {
      setIsTestingClearance(false);
    }
  };

  const handleWarmUp = async () => {
    setIsWarming(true);
    try {
      const saved = await saveConfigSection(["proxy", "flaresolverr_url", "upstream_clearance_enabled", "upstream_clearance_mode", "upstream_clearance_timeout_sec", "upstream_clearance_refresh_interval", "upstream_clearance_warm_up_on_start", "image_challenge_cooldown_seconds"]);
      if (!saved) return;
      const data = await warmUpProxyClearance();
      setRuntimeStatus(data.status || null);
      if (data.result?.ok) toast.success("Clearance 预热成功");
      else toast.error(String(data.result?.error || data.result?.status || "预热失败"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预热失败");
    } finally {
      setIsWarming(false);
    }
  };

  return (
    <SettingsCard
      icon={PlugZap}
      title="稳定代理 / WARP 清障"
      tone="blue"
      meta={<Badge variant={enabled ? "success" : "secondary"}>{enabled ? mode : "未启用"}</Badge>}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadRuntimeStatus()} disabled={isLoadingStatus}>
            {isLoadingStatus ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}
            刷新状态
          </Button>
          <Button onClick={() => void saveConfigSection(["proxy", "flaresolverr_url", "upstream_clearance_enabled", "upstream_clearance_mode", "upstream_clearance_timeout_sec", "upstream_clearance_refresh_interval", "upstream_clearance_warm_up_on_start", "image_challenge_cooldown_seconds"])} disabled={isSavingConfig}>
            {isSavingConfig ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <UpstreamProxyRuntimeStatus config={config} runtimeStatus={runtimeStatus} />
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
