"use client";

import * as React from "react";

import type { SettingsTabKey } from "./settings-tab-types";

export type ExternalDirtyEntry = {
  id: string;
  tab: SettingsTabKey;
  label: string;
  isDirty: boolean;
  /** Optional synchronous or async validator returning true if valid (toast errors inside). */
  validate?: () => boolean | Promise<boolean>;
  /** Save handler for cards owning local state (e.g. Email SMTP, Risk Settings, Backup). */
  save?: () => Promise<boolean>;
  /** Discard handler reverting local card state back to server baseline. */
  discard?: () => Promise<boolean> | boolean;
};

type DirtyRegistryContextValue = {
  entries: Record<string, ExternalDirtyEntry>;
  upsertEntry: (entry: ExternalDirtyEntry) => void;
  removeEntry: (id: string) => void;
};

const DirtyRegistryContext =
  React.createContext<DirtyRegistryContextValue | null>(null);

export function SettingsDirtyRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [entries, setEntries] = React.useState<
    Record<string, ExternalDirtyEntry>
  >({});

  const upsertEntry = React.useCallback((entry: ExternalDirtyEntry) => {
    setEntries((prev) => {
      const existing = prev[entry.id];
      if (
        existing &&
        existing.tab === entry.tab &&
        existing.label === entry.label &&
        existing.isDirty === entry.isDirty &&
        existing.validate === entry.validate &&
        existing.save === entry.save &&
        existing.discard === entry.discard
      ) {
        return prev;
      }
      return { ...prev, [entry.id]: entry };
    });
  }, []);

  const removeEntry = React.useCallback((id: string) => {
    setEntries((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ entries, upsertEntry, removeEntry }),
    [entries, upsertEntry, removeEntry]
  );

  return (
    <DirtyRegistryContext.Provider value={value}>
      {children}
    </DirtyRegistryContext.Provider>
  );
}

export { DirtyRegistryContext };
