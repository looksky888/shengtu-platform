"use client";

import { toast } from "sonner";
import type { StateCreator } from "zustand";

import {
  fetchRegisterConfig,
  resetRegister as resetRegisterApi,
  resetOutlookPool as resetOutlookPoolApi,
  startRegister,
  stopRegister,
  updateRegisterConfig,
  type RegisterConfig,
} from "@/lib/api";
import {
  normalizeRegisterClearanceConfig,
  normalizeRegisterConfig,
} from "./settings-normalizers";
import { registerConfigSnapshot } from "./settings-dirty";
import { runSettingsRequest, type SettingsRequestFlight } from "./settings-load-flight";
import type { SettingsLoadOptions, SettingsStore } from "./settings-store-types";

const registerFlight: SettingsRequestFlight<boolean> = { value: null };

export type RegisterSlice = Pick<
  SettingsStore,
  | "registerConfig"
  | "savedRegisterSnapshot"
  | "isLoadingRegister"
  | "isSavingRegister"
  | "loadRegister"
  | "setRegisterConfig"
  | "setRegisterClearance"
  | "setRegisterProxy"
  | "setRegisterTotal"
  | "setRegisterThreads"
  | "setRegisterMode"
  | "setRegisterTarget"
  | "setRegisterTargetQuota"
  | "setRegisterTargetAvailable"
  | "setRegisterCheckInterval"
  | "setRegisterMailField"
  | "setRegisterGrokField"
  | "addRegisterProvider"
  | "updateRegisterProvider"
  | "deleteRegisterProvider"
  | "saveRegister"
  | "toggleRegister"
  | "resetRegister"
  | "resetOutlookPool"
>;

export const createRegisterSlice: StateCreator<SettingsStore, [], [], RegisterSlice> = (set, get) => ({
  registerConfig: null,
  savedRegisterSnapshot: "",
  isLoadingRegister: true,
  isSavingRegister: false,

  loadRegister: (options: SettingsLoadOptions = {}) => runSettingsRequest(registerFlight, async (isCurrent) => {
    const { silent = false, signal } = options;
    if (!silent) set({ isLoadingRegister: true });
    try {
      const data = await fetchRegisterConfig({ signal });
      if (!isCurrent()) return false;
      set((state) => ({
        registerConfig: normalizeRegisterConfig(data.register),
        savedRegisterSnapshot: registerConfigSnapshot(normalizeRegisterConfig(data.register)),
        loadedAt: { ...state.loadedAt, register: Date.now() },
      }));
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      if (!signal?.aborted && !silent) {
        toast.error(error instanceof Error ? error.message : "加载注册配置失败");
      }
      return false;
    } finally {
      if (isCurrent() && (!silent || get().isLoadingRegister)) set({ isLoadingRegister: false });
    }
  }),

  setRegisterConfig: (config) => {
    // While user is saving, keep local form until save response wins.
    if (get().isSavingRegister) return;
    const nextConfig = normalizeRegisterConfig(config);
    set({ registerConfig: nextConfig, savedRegisterSnapshot: registerConfigSnapshot(nextConfig), isLoadingRegister: false });
  },

  setRegisterClearance: (updates) => {
    set((state) => {
      if (!state.registerConfig) return {};
      return {
        registerConfig: {
          ...state.registerConfig,
          clearance: normalizeRegisterClearanceConfig({
            ...state.registerConfig.clearance,
            ...updates,
          }) as RegisterConfig["clearance"],
        },
      };
    });
  },

  setRegisterProxy: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, proxy: value } } : {});
  },

  setRegisterTotal: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, total: Number(value) || 0 } } : {});
  },

  setRegisterThreads: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, threads: Number(value) || 0 } } : {});
  },

  setRegisterMode: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, mode: value } } : {});
  },

  setRegisterTarget: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, target: value } } : {});
  },

  setRegisterTargetQuota: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, target_quota: Number(value) || 0 } } : {});
  },

  setRegisterTargetAvailable: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, target_available: Number(value) || 0 } } : {});
  },

  setRegisterCheckInterval: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, check_interval: Number(value) || 0 } } : {});
  },

  setRegisterGrokField: (key, value) => {
    set((state) => {
      if (!state.registerConfig) return {};
      const grok = { ...(state.registerConfig.grok || {}) };
      grok[key] = value;
      return { registerConfig: { ...state.registerConfig, grok } };
    });
  },

  setRegisterMailField: (key, value) => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: { ...state.registerConfig.mail, [key]: Number(value) || 0 },
      },
    } : {});
  },

  addRegisterProvider: () => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: {
          ...state.registerConfig.mail,
          providers: [
            ...(state.registerConfig.mail.providers || []),
            { enable: true, type: "tempmail_lol", api_key: "", domain: [] },
          ],
        },
      },
    } : {});
  },

  updateRegisterProvider: (index, updates) => {
    set((state) => {
      if (!state.registerConfig) return {};
      const providers = [...(state.registerConfig.mail.providers || [])];
      providers[index] = { ...(providers[index] || {}), ...updates };
      return { registerConfig: { ...state.registerConfig, mail: { ...state.registerConfig.mail, providers } } };
    });
  },

  deleteRegisterProvider: (index) => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: {
          ...state.registerConfig.mail,
          providers: (state.registerConfig.mail.providers || []).filter((_, itemIndex) => itemIndex !== index),
        },
      },
    } : {});
  },

  saveRegister: async () => {
    const { registerConfig } = get();
    if (!registerConfig) return false;
    try {
      set({ isSavingRegister: true });
      const data = await updateRegisterConfig({
        mail: registerConfig.mail,
        proxy: registerConfig.proxy.trim(),
        total: Math.max(1, Number(registerConfig.total) || 1),
        threads: Math.max(1, Number(registerConfig.threads) || 1),
        mode: registerConfig.mode,
        target: (registerConfig.target === "grok" ? "grok" : "openai") as "openai" | "grok",
        target_quota: Math.max(1, Number(registerConfig.target_quota) || 1),
        target_available: Math.max(1, Number(registerConfig.target_available) || 1),
        check_interval: Math.max(1, Number(registerConfig.check_interval) || 5),
        clearance: normalizeRegisterClearanceConfig(registerConfig.clearance) as RegisterConfig["clearance"],
        grok: registerConfig.grok,
      });
      const nextConfig = normalizeRegisterConfig(data.register);
      set({ registerConfig: nextConfig, savedRegisterSnapshot: registerConfigSnapshot(nextConfig) });
      toast.success("注册配置已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存注册配置失败");
      return false;
    } finally {
      set({ isSavingRegister: false });
    }
  },

  toggleRegister: async () => {
    const { registerConfig } = get();
    if (!registerConfig) return;
    set({ isSavingRegister: true });
    try {
      if (!registerConfig.enabled) {
        await updateRegisterConfig({
          mail: registerConfig.mail,
          proxy: registerConfig.proxy.trim(),
          total: Math.max(1, Number(registerConfig.total) || 1),
          threads: Math.max(1, Number(registerConfig.threads) || 1),
          mode: registerConfig.mode,
          target: (registerConfig.target === "grok" ? "grok" : "openai") as "openai" | "grok",
          target_quota: Math.max(1, Number(registerConfig.target_quota) || 1),
          target_available: Math.max(1, Number(registerConfig.target_available) || 1),
          check_interval: Math.max(1, Number(registerConfig.check_interval) || 5),
          clearance: normalizeRegisterClearanceConfig(registerConfig.clearance) as RegisterConfig["clearance"],
          grok: registerConfig.grok,
        });
      }
      const data = registerConfig.enabled ? await stopRegister() : await startRegister();
      const nextConfig = normalizeRegisterConfig(data.register);
      set({ registerConfig: nextConfig, savedRegisterSnapshot: registerConfigSnapshot(nextConfig) });
      toast.success(registerConfig.enabled ? "注册任务已停止" : "注册任务已启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换注册状态失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },

  resetRegister: async () => {
    set({ isSavingRegister: true });
    try {
      const data = await resetRegisterApi();
      const nextConfig = normalizeRegisterConfig(data.register);
      set({ registerConfig: nextConfig, savedRegisterSnapshot: registerConfigSnapshot(nextConfig) });
      toast.success("注册统计已重置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置注册统计失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },

  resetOutlookPool: async (scope) => {
    set({ isSavingRegister: true });
    try {
      const data = await resetOutlookPoolApi(scope);
      const nextConfig = normalizeRegisterConfig(data.register);
      set({ registerConfig: nextConfig, savedRegisterSnapshot: registerConfigSnapshot(nextConfig) });
      toast.success(
        scope === "unused"
          ? "已清空未使用邮箱"
          : scope === "failed" || scope === "retryable"
            ? "已释放可重试（失败/占用）邮箱状态"
            : scope === "invalid"
              ? "已清除异常邮箱状态"
              : "Outlook 邮箱池状态已全部重置",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置邮箱池状态失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },
});
