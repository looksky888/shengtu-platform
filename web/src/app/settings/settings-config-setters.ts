import type { StoreApi } from "zustand";

import type { SettingsStore } from "./settings-store-types";

type SetSettingsState = StoreApi<SettingsStore>["setState"];

export function createConfigSetters(set: SetSettingsState) {
  return {
    setCanvasUrl: (value: string) => {
      set((state) =>
        state.config ? { config: { ...state.config, canvas_url: value } } : {}
      );
    },
    setRefreshAccountIntervalMinute: (value: string) => {
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                refresh_account_interval_minute: value,
              },
            }
          : {}
      );
    },
    setImageRetentionDays: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_retention_days: value } }
          : {}
      );
    },
    setMediaStorageField: (
      updates: Partial<NonNullable<SettingsStore["config"]>>
    ) => {
      set((state) =>
        state.config ? { config: { ...state.config, ...updates } } : {}
      );
    },
    setLoginPageVisualField: (
      updates: Partial<NonNullable<SettingsStore["config"]>>
    ) => {
      set((state) =>
        state.config ? { config: { ...state.config, ...updates } } : {}
      );
    },
    setVideoRetentionDays: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, video_retention_days: value } }
          : {}
      );
    },
    setLogRetentionDays: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, log_retention_days: value } }
          : {}
      );
    },
    setImageConcurrentLimit: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_concurrent_limit: value } }
          : {}
      );
    },
    setImageWorkerCount: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_worker_count: value } }
          : {}
      );
    },
    setImageQueueCapacity: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_queue_capacity: value } }
          : {}
      );
    },
    setVideoWorkerCount: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, video_worker_count: value } }
          : {}
      );
    },
    setVideoQueueCapacity: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, video_queue_capacity: value } }
          : {}
      );
    },
    setImageAccountConcurrency: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_account_concurrency: value } }
          : {}
      );
    },
    setImageAccountSchedule: (
      value: Parameters<SettingsStore["setImageAccountSchedule"]>[0]
    ) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_account_schedule: value } }
          : {}
      );
    },
    setImageTaskTimeoutSeconds: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_task_timeout_seconds: value } }
          : {}
      );
    },
    setImageProxyField: (
      updates: Partial<NonNullable<SettingsStore["config"]>>
    ) => {
      set((state) =>
        state.config ? { config: { ...state.config, ...updates } } : {}
      );
    },
    setImageCreditCost1080p: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_credit_cost_1080p: value } }
          : {}
      );
    },
    setGPTImage2CreditCost: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, gpt_image_2_credit_cost: value } }
          : {}
      );
    },
    setGPTImage25CreditCost: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, gpt_image_2_5_credit_cost: value } }
          : {}
      );
    },
    setGPTImage25FlareCreditCost: (value: string) => {
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                gpt_image_2_5_flare_credit_cost: value,
              },
            }
          : {}
      );
    },
    setGPTImage25SunburstCreditCost: (value: string) => {
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                gpt_image_2_5_sunburst_credit_cost: value,
              },
            }
          : {}
      );
    },
    setImageCreditCost2k: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_credit_cost_2k: value } }
          : {}
      );
    },
    setImageCreditCost4k: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, image_credit_cost_4k: value } }
          : {}
      );
    },
    setGrokImageCreditCost1k: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, grok_image_credit_cost_1k: value } }
          : {}
      );
    },
    setGrokImageCreditCost2k: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, grok_image_credit_cost_2k: value } }
          : {}
      );
    },
    setVideoCreditCostPerSecond: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, video_credit_cost_per_second: value } }
          : {}
      );
    },
    setUserDefaultConcurrentLimit: (value: string) => {
      set((state) =>
        state.config
          ? {
              config: { ...state.config, user_default_concurrent_limit: value },
            }
          : {}
      );
    },
    setUserDefaultRpmLimit: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, user_default_rpm_limit: value } }
          : {}
      );
    },
    setAPIKeyDefaultRpmLimit: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, api_key_default_rpm_limit: value } }
          : {}
      );
    },
    setAPIKeyDefaultConcurrentLimit: (value: string) => {
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                api_key_default_concurrent_limit: value,
              },
            }
          : {}
      );
    },
    setAPIKeyDailyRequestLimit: (value: string) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, api_key_daily_request_limit: value } }
          : {}
      );
    },
    setAutoRemoveInvalidAccounts: (value: boolean) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, auto_remove_invalid_accounts: value } }
          : {}
      );
    },
    setAutoRemoveRateLimitedAccounts: (value: boolean) => {
      set((state) =>
        state.config
          ? {
              config: {
                ...state.config,
                auto_remove_rate_limited_accounts: value,
              },
            }
          : {}
      );
    },
    setLogLevel: (level: string, enabled: boolean) => {
      set((state) => {
        if (!state.config) return {};
        const levels = new Set(state.config.log_levels || []);
        if (enabled) levels.add(level);
        else levels.delete(level);
        return { config: { ...state.config, log_levels: Array.from(levels) } };
      });
    },
    setProxy: (value: string) => {
      set((state) =>
        state.config ? { config: { ...state.config, proxy: value } } : {}
      );
    },
    setUpstreamClearanceField: (
      updates: Partial<NonNullable<SettingsStore["config"]>>
    ) => {
      set((state) =>
        state.config ? { config: { ...state.config, ...updates } } : {}
      );
    },
    setBaseUrl: (value: string) => {
      set((state) =>
        state.config ? { config: { ...state.config, base_url: value } } : {}
      );
    },
    setRegistrationEnabled: (value: boolean) => {
      set((state) =>
        state.config
          ? { config: { ...state.config, registration_enabled: value } }
          : {}
      );
    },
  };
}
