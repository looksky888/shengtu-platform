"use client";

import { create } from "zustand";

import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";

import { createConfigSlice } from "./settings-store-config";
import { createCPASlice } from "./settings-store-cpa";
import { invalidateSettingsRequests } from "./settings-load-flight";
import type { LoadTabDataOptions, SettingsStore } from "./settings-store-types";
import { parseSettingsTab, type AnySettingsTabKey } from "./settings-tab-types";

export type {
  LoadTabDataOptions,
  PageSizeOption,
  SettingsStore,
} from "./settings-store-types";
export { PAGE_SIZE_OPTIONS } from "./settings-store-types";

export const useSettingsStore = create<SettingsStore>()((set, get, api) => ({
  ...createCPASlice(set, get, api),
  ...createConfigSlice(set, get, api),
  loadedAt: {},

  loadTabData: async (
    rawTab: AnySettingsTabKey,
    options: LoadTabDataOptions = {},
  ) => {
    const tab = parseSettingsTab(rawTab);
    const { force = false, silent = false } = options;
    const loaded = get().loadedAt;
    const tasks: Promise<unknown>[] = [];

    if (
      tab === "config" ||
      tab === "channels" ||
      tab === "proxy" ||
      tab === "email" ||
      tab === "media" ||
      tab === "backup"
    ) {
      if (force || !loaded.config) {
        tasks.push(get().loadConfig({ silent }));
      }
    }
    if (tab === "cpa" && (force || !loaded.pools)) {
      tasks.push(get().loadPools({ silent }));
    }
    if (tab === "backup" && (force || !loaded.logGovernance)) {
      tasks.push(get().loadLogGovernance({ silent }));
    }

    await Promise.all(tasks);
  },
}));

export function resetSettingsStoreForSessionChange() {
  invalidateSettingsRequests();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
}

if (typeof window !== "undefined") {
  window.addEventListener(
    AUTH_SESSION_CHANGE_EVENT,
    resetSettingsStoreForSessionChange,
  );
}
