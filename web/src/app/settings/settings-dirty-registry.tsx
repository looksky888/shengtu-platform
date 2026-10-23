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

export function useSettingsDirtyRegistry() {
  return React.useContext(DirtyRegistryContext);
}

/**
 * Register a settings card's local dirty state and/or validator into the global SettingsTabs bar.
 * Safe no-op when rendered outside SettingsDirtyRegistryProvider (e.g. isolated unit tests).
 */
export function useRegisterSettingsDirty(entry: ExternalDirtyEntry) {
  const ctx = React.useContext(DirtyRegistryContext);
  const latestRef = React.useRef(entry);
  latestRef.current = entry;

  const stableValidate = React.useCallback(
    () => (latestRef.current.validate ? latestRef.current.validate() : true),
    []
  );
  const stableSave = React.useCallback(
    async () => (latestRef.current.save ? latestRef.current.save() : true),
    []
  );
  const stableDiscard = React.useCallback(
    async () =>
      latestRef.current.discard ? latestRef.current.discard() : true,
    []
  );

  React.useEffect(() => {
    if (!ctx) return;
    ctx.upsertEntry({
      id: entry.id,
      tab: entry.tab,
      label: entry.label,
      isDirty: entry.isDirty,
      validate: entry.validate ? stableValidate : undefined,
      save: entry.save ? stableSave : undefined,
      discard: entry.discard ? stableDiscard : undefined,
    });
  }, [
    ctx,
    entry.id,
    entry.tab,
    entry.label,
    entry.isDirty,
    Boolean(entry.validate),
    Boolean(entry.save),
    Boolean(entry.discard),
    stableValidate,
    stableSave,
    stableDiscard,
  ]);

  React.useEffect(() => {
    if (!ctx) return;
    const id = entry.id;
    return () => ctx.removeEntry(id);
  }, [ctx, entry.id]);
}
