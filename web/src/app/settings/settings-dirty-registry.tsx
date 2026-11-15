"use client";

import * as React from "react";

import {
  createSettingsDirtyRegistryStore,
  DirtyRegistryStoreContext,
  type DirtyRegistryEntry,
  type SettingsDirtyRegistryStore,
} from "./settings-dirty-registry-store";
import type { AnySettingsTabKey, SettingsTabKey } from "./settings-tab-types";

export type ExternalDirtyEntry = DirtyRegistryEntry<AnySettingsTabKey>;
export type NormalizedDirtyEntry = DirtyRegistryEntry<SettingsTabKey>;

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
