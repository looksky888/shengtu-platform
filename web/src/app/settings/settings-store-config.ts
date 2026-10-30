"use client";

import { toast } from "sonner";
import type { StateCreator } from "zustand";

import {
  cleanupLogs,
  fetchImageProxyModels,
  fetchLogGovernance,
  fetchSettingsConfig,
  saveLoginPageImageSettings,
  updateSettingsConfig,
} from "@/lib/api";
import { dispatchAppMetaUpdated } from "@/lib/app-meta";
import {
  normalizeLoginPageImageMode,
  normalizeLoginPageImageTransform,
} from "@/lib/login-page-image-layout";
import type { SettingsConfig } from "@/lib/settings-types";

import { buildSettingsPayload } from "./settings-config-payload";
import { createConfigSetters } from "./settings-config-setters";
import {
  configSnapshot,
  extractSavedConfigSection,
  mergeConfigSnapshot,
} from "./settings-dirty";
import {
  runSettingsRequest,
  type SettingsRequestFlight,
} from "./settings-load-flight";
import { normalizeConfig } from "./settings-normalizers";
import type {
  SaveConfigSectionOptions,
  SettingsLoadOptions,
  SettingsStore,
} from "./settings-store-types";

const configFlight: SettingsRequestFlight<boolean> = { value: null };
const logGovernanceFlight: SettingsRequestFlight = { value: null };

const LOGIN_VISUAL_CONFIG_KEYS: Array<keyof SettingsConfig> = [
  "login_page_image_url",
  "login_page_image_mode",
  "login_page_image_zoom",
  "login_page_image_position_x",
  "login_page_image_position_y",
];

function revokeObjectUrlSafely(url: string) {
  if (url && url.startsWith("blob:") && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

function buildLoginPageImageFormData(
  config: SettingsConfig,
  pendingFile: File | null,
): FormData {
  const formData = new FormData();
  const mode = normalizeLoginPageImageMode(config.login_page_image_mode);
  const transform = normalizeLoginPageImageTransform({
    zoom: Number(config.login_page_image_zoom),
    positionX: Number(config.login_page_image_position_x),
    positionY: Number(config.login_page_image_position_y),
  });
  formData.set("login_page_image_mode", mode);
  formData.set("login_page_image_zoom", String(transform.zoom));
  formData.set("login_page_image_position_x", String(transform.positionX));
  formData.set("login_page_image_position_y", String(transform.positionY));

  const trimmedUrl = String(config.login_page_image_url || "").trim();
  if (pendingFile) {
    formData.set("login_page_image_action", "replace");
    formData.set("login_page_image_file", pendingFile);
  } else if (!trimmedUrl) {
    formData.set("login_page_image_action", "remove");
  } else {
    formData.set("login_page_image_url", trimmedUrl);
  }
  return formData;
}

export type ConfigSlice = Pick<
  SettingsStore,
  | "config"
  | "savedConfigSnapshot"
  | "pendingLoginImageFile"
  | "pendingLoginImagePreviewUrl"
  | "isLoadingConfig"
  | "isSavingConfig"
  | "savingSectionKey"
  | "isFetchingImageProxyModels"
  | "logGovernance"
  | "lastLogCleanup"
  | "isLoadingLogGovernance"
  | "isCleaningLogs"
  | "loadConfig"
  | "saveConfig"
  | "saveConfigSection"
  | "saveLoginPageVisual"
  | "stageLoginPageImageFile"
  | "resetConfigSection"
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
  | "setLoginPageVisualField"
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

function syncAppMetaFromConfig(
  nextConfig: SettingsConfig,
  savedKeys?: Array<keyof SettingsConfig>
) {
  const keys = savedKeys ? new Set(savedKeys) : null;
  if (
    !keys ||
    keys.has("canvas_url") ||
    keys.has("login_page_image_url") ||
    keys.has("login_page_image_mode") ||
    keys.has("login_page_image_zoom") ||
    keys.has("login_page_image_position_x") ||
    keys.has("login_page_image_position_y")
  ) {
    const loginImageTransform = normalizeLoginPageImageTransform({
      zoom: Number(nextConfig.login_page_image_zoom),
      positionX: Number(nextConfig.login_page_image_position_x),
      positionY: Number(nextConfig.login_page_image_position_y),
    });
    dispatchAppMetaUpdated({
      canvas_url: nextConfig.canvas_url || "",
      login_page_image_url: nextConfig.login_page_image_url || "",
      login_page_image_mode: normalizeLoginPageImageMode(
        nextConfig.login_page_image_mode
      ),
      login_page_image_zoom: loginImageTransform.zoom,
      login_page_image_position_x: loginImageTransform.positionX,
      login_page_image_position_y: loginImageTransform.positionY,
    });
  }
}

export const createConfigSlice: StateCreator<
  SettingsStore,
  [],
  [],
  ConfigSlice
> = (set, get) => {
  const baseSetters = createConfigSetters(set);

  return {
    config: null,
    savedConfigSnapshot: "",
    pendingLoginImageFile: null,
    pendingLoginImagePreviewUrl: "",
    isLoadingConfig: true,
    isSavingConfig: false,
    savingSectionKey: null,
    isFetchingImageProxyModels: false,
    logGovernance: null,
    lastLogCleanup: null,
    isLoadingLogGovernance: true,
    isCleaningLogs: false,

    loadConfig: (options: SettingsLoadOptions = {}) =>
      runSettingsRequest(configFlight, async (isCurrent) => {
        const { silent = false, signal } = options;
        if (!silent) set({ isLoadingConfig: true });
        try {
          const data = await fetchSettingsConfig({ signal });
          if (!isCurrent()) return false;
          const normalized = normalizeConfig(data.config);
          revokeObjectUrlSafely(get().pendingLoginImagePreviewUrl);
          set((state) => ({
            config: normalized,
            savedConfigSnapshot: configSnapshot(normalized),
            pendingLoginImageFile: null,
            pendingLoginImagePreviewUrl: "",
            loadedAt: { ...state.loadedAt, config: Date.now() },
          }));
          return true;
        } catch (error) {
          if (!isCurrent()) return false;
          if (!signal?.aborted && !silent) {
            toast.error(
              error instanceof Error ? error.message : "加载系统配置失败"
            );
          }
          return false;
        } finally {
          if (isCurrent() && (!silent || get().isLoadingConfig))
            set({ isLoadingConfig: false });
        }
      }),

    saveConfig: async () => {
      const { config, pendingLoginImageFile, pendingLoginImagePreviewUrl } = get();
      if (!config) {
        return false;
      }

      set({ isSavingConfig: true, savingSectionKey: "__all__" });
      try {
        let workingConfig = config;
        const savedBaseline = extractSavedConfigSection(
          get().savedConfigSnapshot,
          ["login_page_image_url"]
        );
        const previousSavedUrl = String(savedBaseline.login_page_image_url || "").trim();
        const shouldSyncLoginImageEndpoint =
          Boolean(pendingLoginImageFile) ||
          (previousSavedUrl.startsWith("/login-page-images/") &&
            previousSavedUrl !== String(config.login_page_image_url || "").trim());

        if (shouldSyncLoginImageEndpoint) {
          const imageData = await saveLoginPageImageSettings(
            buildLoginPageImageFormData(config, pendingLoginImageFile)
          );
          const uploadedConfig = normalizeConfig(imageData.config);
          workingConfig = {
            ...config,
            login_page_image_url: uploadedConfig.login_page_image_url,
          };
          revokeObjectUrlSafely(pendingLoginImagePreviewUrl);
          set({
            pendingLoginImageFile: null,
            pendingLoginImagePreviewUrl: "",
          });
        }

        const data = await updateSettingsConfig(buildSettingsPayload(workingConfig));
        const nextConfig = normalizeConfig(data.config);
        set({
          config: nextConfig,
          savedConfigSnapshot: configSnapshot(nextConfig),
        });
        syncAppMetaFromConfig(nextConfig);
        toast.success("系统配置已保存");
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存系统配置失败");
        return false;
      } finally {
        set({ isSavingConfig: false, savingSectionKey: null });
      }
    },

    saveLoginPageVisual: async (options: SaveConfigSectionOptions = {}) => {
      const { config, pendingLoginImageFile, pendingLoginImagePreviewUrl } = get();
      if (!config) return false;
      const sectionKey = options.sectionKey ?? "login_visual";
      set({ isSavingConfig: true, savingSectionKey: sectionKey });
      try {
        const data = await saveLoginPageImageSettings(
          buildLoginPageImageFormData(config, pendingLoginImageFile)
        );
        const nextConfig = normalizeConfig(data.config);
        revokeObjectUrlSafely(pendingLoginImagePreviewUrl);
        set((state) => ({
          pendingLoginImageFile: null,
          pendingLoginImagePreviewUrl: "",
          config: state.config
            ? LOGIN_VISUAL_CONFIG_KEYS.reduce(
                (merged, key) => ({ ...merged, [key]: nextConfig[key] }),
                { ...state.config }
              )
            : nextConfig,
          savedConfigSnapshot: mergeConfigSnapshot(
            state.savedConfigSnapshot,
            nextConfig,
            LOGIN_VISUAL_CONFIG_KEYS.map(String)
          ),
        }));
        syncAppMetaFromConfig(nextConfig, LOGIN_VISUAL_CONFIG_KEYS);
        if (!options.silentToast) {
          toast.success("登录页海报配置已保存并立即生效");
        }
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存登录页海报配置失败");
        return false;
      } finally {
        set({ isSavingConfig: false, savingSectionKey: null });
      }
    },

    stageLoginPageImageFile: (file: File | null) => {
      revokeObjectUrlSafely(get().pendingLoginImagePreviewUrl);
      if (!file) {
        set({
          pendingLoginImageFile: null,
          pendingLoginImagePreviewUrl: "",
        });
        return;
      }
      const previewUrl =
        typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : "";
      set((state) => ({
        pendingLoginImageFile: file,
        pendingLoginImagePreviewUrl: previewUrl,
        config: state.config
          ? {
              ...state.config,
              login_page_image_mode: "cover",
            }
          : state.config,
      }));
    },

    saveConfigSection: async (keys, options: SaveConfigSectionOptions = {}) => {
      const { config } = get();
      if (!config || keys.length === 0) return null;
      const fullPayload = buildSettingsPayload(config);
      const payload = Object.fromEntries(
        keys
          .filter((key) => Object.prototype.hasOwnProperty.call(fullPayload, key))
          .map((key) => [key, fullPayload[key]])
      ) as Partial<SettingsConfig>;
      if (Object.keys(payload).length === 0) return null;

      const sectionKey = options.sectionKey ?? String(keys[0]);
      set({ isSavingConfig: true, savingSectionKey: sectionKey });
      try {
        const data = await updateSettingsConfig(payload);
        const nextConfig = normalizeConfig(data.config);
        const savedKeys = Object.keys(payload) as Array<keyof SettingsConfig>;
        set((state) => ({
          config: state.config
            ? savedKeys.reduce(
                (merged, key) => ({ ...merged, [key]: nextConfig[key] }),
                { ...state.config }
              )
            : nextConfig,
          savedConfigSnapshot: mergeConfigSnapshot(
            state.savedConfigSnapshot,
            nextConfig,
            savedKeys.map(String)
          ),
        }));
        syncAppMetaFromConfig(nextConfig, savedKeys);
        const restartRequired = savedKeys.some(
          (key) =>
            key === "image_worker_count" ||
            key === "image_queue_capacity" ||
            key === "video_worker_count" ||
            key === "video_queue_capacity" ||
            key === "media_storage_provider"
        );
        if (!options.silentToast) {
          toast.success(
            restartRequired
              ? "配置已保存（部分容量或存储变更需重启服务后完全生效）"
              : "配置已保存并立即生效"
          );
        }
        return { restartRequired };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存系统配置失败");
        return null;
      } finally {
        set({ isSavingConfig: false, savingSectionKey: null });
      }
    },

    resetConfigSection: (keys) => {
      if (keys.includes("login_page_image_url")) {
        revokeObjectUrlSafely(get().pendingLoginImagePreviewUrl);
      }
      set((state) => {
        if (!state.config || !state.savedConfigSnapshot) return {};
        const baseline = extractSavedConfigSection(
          state.savedConfigSnapshot,
          keys
        );
        return {
          ...(keys.includes("login_page_image_url")
            ? {
                pendingLoginImageFile: null,
                pendingLoginImagePreviewUrl: "",
              }
            : {}),
          config: {
            ...state.config,
            ...baseline,
          },
        };
      });
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
        const data = await fetchImageProxyModels({
          base_url: baseUrl,
          api_key: apiKey,
        });
        const models = Array.from(
          new Set(
            (data.models || []).map((item) => String(item).trim()).filter(Boolean)
          )
        );
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
              image_proxy_model:
                currentModel && models.includes(currentModel)
                  ? currentModel
                  : models[0],
            },
          };
        });
        toast.success(`已获取 ${models.length} 个模型`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "获取中转站模型失败"
        );
      } finally {
        set({ isFetchingImageProxyModels: false });
      }
    },

    ...baseSetters,

    setLoginPageVisualField: (updates) => {
      if (Object.prototype.hasOwnProperty.call(updates, "login_page_image_url")) {
        revokeObjectUrlSafely(get().pendingLoginImagePreviewUrl);
        set({
          pendingLoginImageFile: null,
          pendingLoginImagePreviewUrl: "",
        });
      }
      baseSetters.setLoginPageVisualField(updates);
    },

    loadLogGovernance: (options: SettingsLoadOptions = {}) =>
      runSettingsRequest(logGovernanceFlight, async (isCurrent) => {
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
            toast.error(
              error instanceof Error ? error.message : "加载日志治理数据失败"
            );
          }
        } finally {
          if (isCurrent() && (!silent || get().isLoadingLogGovernance))
            set({ isLoadingLogGovernance: false });
        }
      }),

    cleanupLogsByRetention: async (explicitDays?: number) => {
      const { config, savedConfigSnapshot } = get();
      if (!config) {
        return;
      }
      const savedBaseline = extractSavedConfigSection(savedConfigSnapshot, [
        "log_retention_days",
      ]);
      const rawDays =
        explicitDays ??
        Number(savedBaseline.log_retention_days ?? config.log_retention_days);
      const retentionDays = Math.min(3650, Math.max(1, Number(rawDays) || 7));
      set({ isCleaningLogs: true });
      try {
        const data = await cleanupLogs(retentionDays);
        set({
          lastLogCleanup: data.cleanup,
          logGovernance: data.governance,
        });
        toast.success(`已按 ${retentionDays} 天保留期清理 ${data.cleanup.deleted} 条历史日志`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "清理日志失败");
      } finally {
        set({ isCleaningLogs: false });
      }
    },
  };
};
