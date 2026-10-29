"use client";

import * as React from "react";

import {
  DirtyRegistryContext,
  type ExternalDirtyEntry,
} from "./settings-dirty-registry";

export function useSettingsDirtyRegistry() {
  return React.useContext(DirtyRegistryContext);
}

/** Register a settings card's local dirty state and/or validator into the global SettingsTabs bar. */
export function useRegisterSettingsDirty(entry: ExternalDirtyEntry) {
  const ctx = React.useContext(DirtyRegistryContext);
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
    if (!ctx) return;
    ctx.upsertEntry({
      id: entry.id,
      tab: entry.tab,
      label: entry.label,
      isDirty: entry.isDirty,
      validate: hasValidate ? stableValidate : undefined,
      save: hasSave ? stableSave : undefined,
      discard: hasDiscard ? stableDiscard : undefined,
    });
  }, [
    ctx,
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
    if (!ctx) return;
    const id = entry.id;
    return () => ctx.removeEntry(id);
  }, [ctx, entry.id]);
}
