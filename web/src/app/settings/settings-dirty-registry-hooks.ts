"use client";

import * as React from "react";

import type { ExternalDirtyEntry } from "./settings-dirty-registry";
import {
  DirtyRegistryStoreContext,
  type SettingsDirtyRegistryStore,
} from "./settings-dirty-registry-store";
import type { SettingsTabKey } from "./settings-tab-types";

const EMPTY_ENTRIES: Record<string, ExternalDirtyEntry> = {};
const noopSubscribe = () => () => {};
const getEmptyEntries = () => EMPTY_ENTRIES;

export function useSettingsDirtyRegistry() {
  const store = React.useContext(
    DirtyRegistryStoreContext,
  ) as SettingsDirtyRegistryStore<SettingsTabKey> | null;
  const entries = React.useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : getEmptyEntries,
    store ? store.getSnapshot : getEmptyEntries,
  );

  return React.useMemo(
    () =>
      store
        ? {
            entries,
            upsertEntry: store.upsertEntry,
            removeEntry: store.removeEntry,
          }
        : null,
    [entries, store],
  );
}

/** Register a settings card's local dirty state and/or validator into the global SettingsTabs bar. */
export function useRegisterSettingsDirty(entry: ExternalDirtyEntry) {
  const store = React.useContext(
    DirtyRegistryStoreContext,
  ) as SettingsDirtyRegistryStore<SettingsTabKey> | null;
  const latestRef = React.useRef(entry);
  latestRef.current = entry;

  const stableValidate = React.useCallback(
    () => (latestRef.current.validate ? latestRef.current.validate() : true),
    [],
  );
  const stableSave = React.useCallback(
    async () => (latestRef.current.save ? latestRef.current.save() : true),
    [],
  );
  const stableDiscard = React.useCallback(
    async () =>
      latestRef.current.discard ? latestRef.current.discard() : true,
    [],
  );
  const hasValidate = Boolean(entry.validate);
  const hasSave = Boolean(entry.save);
  const hasDiscard = Boolean(entry.discard);

  React.useEffect(() => {
    if (!store) return;
    store.upsertEntry({
      id: entry.id,
      tab: entry.tab,
      label: entry.label,
      isDirty: entry.isDirty,
      validate: hasValidate ? stableValidate : undefined,
      save: hasSave ? stableSave : undefined,
      discard: hasDiscard ? stableDiscard : undefined,
    });
  }, [
    store,
    entry.id,
    entry.tab,
    entry.label,
    entry.isDirty,
    hasValidate,
    hasSave,
    hasDiscard,
    stableValidate,
    stableSave,
    stableDiscard,
  ]);

  React.useEffect(() => {
    if (!store) return;
    const id = entry.id;
    return () => store.removeEntry(id);
  }, [store, entry.id]);
}
