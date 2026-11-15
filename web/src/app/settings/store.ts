"use client";

import { create } from "zustand";

import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";

import { createConfigSlice } from "./settings-store-config";
import { createCPASlice } from "./settings-store-cpa";
import { invalidateSettingsRequests } from "./settings-load-flight";
import type { SettingsStore } from "./settings-store-types";
import { parseSettingsTab, type AnySettingsTabKey } from "./settings-tab-types";

export type { PageSizeOption, SettingsStore } from "./settings-store-types";
export { PAGE_SIZE_OPTIONS } from "./settings-store-types";

export const useSettingsStore = create<SettingsStore>()((set, get, api) => ({
  ...createCPASlice(set, get, api),
  ...createConfigSlice(set, get, api),
  loadedAt: {},

  loadTabData: async (rawTab: AnySettingsTabKey) => {
    const tab = parseSettingsTab(rawTab);
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
      if (!loaded.config) tasks.push(get().loadConfig());
    }
    if (tab === "cpa" && !loaded.pools) {
      tasks.push(get().loadPools());
    }
    if (tab === "backup" && !loaded.logGovernance) {
      tasks.push(get().loadLogGovernance());
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
