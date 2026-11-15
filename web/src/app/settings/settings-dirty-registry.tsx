"use client";

import * as React from "react";

import {
  createSettingsDirtyRegistryStore,
  DirtyRegistryStoreContext,
  type SettingsDirtyEntry,
  type SettingsDirtyRegistryStore,
} from "./settings-dirty-registry-store";
import type { SettingsTabKey } from "./settings-tab-types";

export type { SettingsDirtyEntry };
export type ExternalDirtyEntry = SettingsDirtyEntry<SettingsTabKey>;
export type NormalizedDirtyEntry = SettingsDirtyEntry<SettingsTabKey>;

export function SettingsDirtyRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeRef = React.useRef<SettingsDirtyRegistryStore<SettingsTabKey> | null>(
    null,
  );
  if (storeRef.current === null) {
    storeRef.current = createSettingsDirtyRegistryStore<SettingsTabKey>();
  }

  return (
    <DirtyRegistryStoreContext.Provider value={storeRef.current}>
      {children}
    </DirtyRegistryStoreContext.Provider>
  );
}
