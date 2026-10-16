"use client";

import { toast } from "sonner";
import type { StateCreator } from "zustand";

import {
  cleanupLogs,
  fetchLogGovernance,
  fetchImageProxyModels,
  fetchSettingsConfig,
  updateSettingsConfig,
} from "@/lib/api";
import type { SettingsConfig } from "@/lib/settings-types";
import { dispatchAppMetaUpdated } from "@/lib/app-meta";
import { createConfigSetters } from "./settings-config-setters";
import { buildSettingsPayload } from "./settings-config-payload";
import { normalizeConfig } from "./settings-normalizers";
import { configSnapshot, mergeConfigSnapshot } from "./settings-dirty";
import { runSettingsRequest, type SettingsRequestFlight } from "./settings-load-flight";
import type { SaveConfigReceipt, SettingsLoadOptions, SettingsStore } from "./settings-store-types";

const configFlight: SettingsRequestFlight<boolean> = { value: null };
const logGovernanceFlight: SettingsRequestFlight = { value: null };

export type ConfigSlice = Pick<
  SettingsStore,
  | "config"
  | "savedConfigSnapshot"
  | "isLoadingConfig"
  | "isSavingConfig"
  | "isFetchingImageProxyModels"
  | "logGovernance"
  | "lastLogCleanup"
  | "isLoadingLogGovernance"
  | "isCleaningLogs"
  | "loadConfig"
  | "saveConfig"
  | "saveConfigSection"
  | "fetchImageProxyModelOptions"
  | "setRefreshAccountIntervalMinute"
  | "setImageConcurrentLimit"
  | "setImageWorkerCount"
  | "setImageQueueCapacity"
  | "setVideoWorkerCount"
  | "setVideoQueueCapacity"
  | "setImageAccountConcurrency"
  | "setImageAccountSchedule"
  | "setImageTaskTimeoutSeconds"
  | "setImageProxyField"
  | "setImageCreditCost4k"
  | "setImageCreditCost2k"
  | "setImageCreditCost1080p"
  | "setGPTImage2CreditCost"
  | "setGPTImage25CreditCost"
  | "setGPTImage25FlareCreditCost"
  | "setGPTImage25SunburstCreditCost"
  | "setGrokImageCreditCost1k"
  | "setGrokImageCreditCost2k"
  | "setVideoCreditCostPerSecond"
  | "setUserDefaultConcurrentLimit"
  | "setUserDefaultRpmLimit"
  | "setAPIKeyDefaultRpmLimit"
  | "setAPIKeyDefaultConcurrentLimit"
  | "setAPIKeyDailyRequestLimit"
  | "setImageRetentionDays"
  | "setMediaStorageField"
  | "setVideoRetentionDays"
  | "setLogRetentionDays"
  | "setAutoRemoveInvalidAccounts"
  | "setAutoRemoveRateLimitedAccounts"
  | "setLogLevel"
  | "setProxy"
  | "setUpstreamClearanceField"
  | "setCanvasUrl"
  | "setBaseUrl"
  | "setRegistrationEnabled"
  | "loadLogGovernance"
  | "cleanupLogsByRetention"
>;

export const createConfigSlice: StateCreator<SettingsStore, [], [], ConfigSlice> = (set, get) => ({
  config: null,
  savedConfigSnapshot: "",
  isLoadingConfig: true,
  isSavingConfig: false,
  isFetchingImageProxyModels: false,
  logGovernance: null,
  lastLogCleanup: null,
  isLoadingLogGovernance: true,
  isCleaningLogs: false,

  loadConfig: (options: SettingsLoadOptions = {}) => runSettingsRequest(configFlight, async (isCurrent) => {
      const { silent = false, signal } = options;
      if (!silent) set({ isLoadingConfig: true });
      try {
        const data = await fetchSettingsConfig({ signal });
        if (!isCurrent()) return false;
        set((state) => ({
          config: normalizeConfig(data.config),
          savedConfigSnapshot: configSnapshot(normalizeConfig(data.config)),
          loadedAt: { ...state.loadedAt, config: Date.now() },
        }));
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        if (!signal?.aborted && !silent) {
          toast.error(error instanceof Error ? error.message : "加载系统配置失败");
        }
        return false;
      } finally {
        if (isCurrent() && (!silent || get().isLoadingConfig)) set({ isLoadingConfig: false });
      }
  }),

  saveConfig: async () => {
    const { config } = get();
    if (!config) {
      return false;
    }

    set({ isSavingConfig: true });
    try {
      const data = await updateSettingsConfig(buildSettingsPayload(config));
      const nextConfig = normalizeConfig(data.config);
      set({ config: nextConfig, savedConfigSnapshot: configSnapshot(nextConfig) });
      dispatchAppMetaUpdated({ canvas_url: nextConfig.canvas_url || "" });
      toast.success("配置已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存系统配置失败");
      return false;
    } finally {
      set({ isSavingConfig: false });
    }
  },

  saveConfigSection: async (keys) => {
    const { config } = get();
    if (!config || keys.length === 0) return null;
    const fullPayload = buildSettingsPayload(config);
    const payload = Object.fromEntries(
      keys
        .filter((key) => Object.prototype.hasOwnProperty.call(fullPayload, key))
        .map((key) => [key, fullPayload[key]]),
    ) as Partial<SettingsConfig>;
    if (Object.keys(payload).length === 0) return null;
    set({ isSavingConfig: true });
    try {
      const data = await updateSettingsConfig(payload);
      const nextConfig = normalizeConfig(data.config);
      const savedKeys = Object.keys(payload) as Array<keyof SettingsConfig>;
      set((state) => ({
        config: state.config ? savedKeys.reduce((merged, key) => ({ ...merged, [key]: nextConfig[key] }), { ...state.config }) : nextConfig,
        savedConfigSnapshot: mergeConfigSnapshot(state.savedConfigSnapshot, nextConfig, savedKeys.map(String)),
      }));
      toast.success("配置已保存");
      if (savedKeys.includes("canvas_url")) dispatchAppMetaUpdated({ canvas_url: nextConfig.canvas_url || "" });
      const restartRequired = savedKeys.some((key) => key === "image_worker_count" || key === "image_queue_capacity" || key === "video_worker_count" || key === "video_queue_capacity" || key === "media_storage_provider");
      return { restartRequired };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存系统配置失败");
      return null;
    } finally {
      set({ isSavingConfig: false });
    }
  },

  fetchImageProxyModelOptions: async () => {
    const { config } = get();
    if (!config) return;
    const baseUrl = String(config.image_proxy_base_url || "").trim();
    const apiKey = String(config.image_proxy_api_key || "").trim();
    if (!baseUrl || !apiKey) {
      toast.error("请先填写中转站 URL 和 API Key");
      return;
    }
    set({ isFetchingImageProxyModels: true });
    try {
      const data = await fetchImageProxyModels({ base_url: baseUrl, api_key: apiKey });
      const models = Array.from(new Set((data.models || []).map((item) => String(item).trim()).filter(Boolean)));
      if (models.length === 0) {
        toast.error("中转站未返回可用模型");
        return;
      }
      set((state) => {
        if (!state.config) return {};
        const currentModel = String(state.config.image_proxy_model || "").trim();
        return {
          config: {
            ...state.config,
            image_proxy_models: models,
            image_proxy_model: currentModel && models.includes(currentModel) ? currentModel : models[0],
          },
        };
      });
      toast.success(`已获取 ${models.length} 个模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取中转站模型失败");
    } finally {
      set({ isFetchingImageProxyModels: false });
    }
  },

  ...createConfigSetters(set),

  loadLogGovernance: (options: SettingsLoadOptions = {}) => runSettingsRequest(logGovernanceFlight, async (isCurrent) => {
      const { silent = false, signal } = options;
      if (!silent) set({ isLoadingLogGovernance: true });
      try {
        const data = await fetchLogGovernance({ signal });
        if (!isCurrent()) return;
        set((state) => ({
          logGovernance: data.governance,
          loadedAt: { ...state.loadedAt, logGovernance: Date.now() },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        if (!signal?.aborted && !silent) {
          toast.error(error instanceof Error ? error.message : "加载日志治理数据失败");
        }
      } finally {
        if (isCurrent() && (!silent || get().isLoadingLogGovernance)) set({ isLoadingLogGovernance: false });
      }
  }),

  cleanupLogsByRetention: async () => {
    const { config } = get();
    if (!config) {
      return;
    }
    const retentionDays = Math.min(3650, Math.max(1, Number(config.log_retention_days) || 7));
    set({ isCleaningLogs: true });
    try {
      const data = await cleanupLogs(retentionDays);
      set({
        lastLogCleanup: data.cleanup,
        logGovernance: data.governance,
      });
      toast.success(`已清理 ${data.cleanup.deleted} 条历史日志`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理日志失败");
    } finally {
      set({ isCleaningLogs: false });
    }
  },
});
