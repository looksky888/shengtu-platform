import * as React from "react";

import type { SettingsTabKey } from "./settings-tab-types";

export type SettingsDirtyEntry<TTab extends string = SettingsTabKey> = {
  id: string;
  tab: TTab;
  label: string;
  isDirty: boolean;
  /** Optional synchronous or async validator returning true if valid (toast errors inside). */
  validate?: () => boolean | Promise<boolean>;
  /** Save handler for cards owning local or section-scoped state. */
  save?: () => Promise<boolean>;
  /** Discard handler reverting card state back to server baseline. */
  discard?: () => Promise<boolean> | boolean;
};

export type DirtyRegistryEntry<TTab extends string = SettingsTabKey> =
  SettingsDirtyEntry<TTab>;

export type SettingsDirtyRegistryStore<TTab extends string = SettingsTabKey> = {
  getSnapshot: () => Record<string, SettingsDirtyEntry<TTab>>;
  subscribe: (listener: () => void) => () => void;
  upsertEntry: (entry: SettingsDirtyEntry<TTab>) => void;
  removeEntry: (id: string) => void;
};

export function createSettingsDirtyRegistryStore<
  TTab extends string = SettingsTabKey,
>(): SettingsDirtyRegistryStore<TTab> {
  let entries: Record<string, SettingsDirtyEntry<TTab>> = {};
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => entries,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    upsertEntry: (entry: DirtyRegistryEntry<TTab>) => {
      const existing = entries[entry.id];
      if (
        existing &&
        existing.tab === entry.tab &&
        existing.label === entry.label &&
        existing.isDirty === entry.isDirty &&
        existing.validate === entry.validate &&
        existing.save === entry.save &&
        existing.discard === entry.discard
      ) {
        return;
      }
      entries = { ...entries, [entry.id]: entry };
      emit();
    },
    removeEntry: (id: string) => {
      if (!(id in entries)) return;
      const next = { ...entries };
      delete next[id];
      entries = next;
      emit();
    },
  };
}

export const DirtyRegistryStoreContext =
  React.createContext<SettingsDirtyRegistryStore<any> | null>(null);
