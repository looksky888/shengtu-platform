import { useCallback, useEffect, useState } from "react";

import type { ICloudSession } from "@/lib/icloud-api";

const storageKey = "chatgpt2api.icloud.selected-account-ids";

export function normalizeICloudAccountIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function parseICloudAccountSelection(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return normalizeICloudAccountIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function availableICloudAccountIds(selected: string[], sessions: ICloudSession[]): string[] {
  const available = new Set(sessions.map((session) => String(session.account_id || "").trim()).filter(Boolean));
  return normalizeICloudAccountIds(selected).filter((id) => available.has(id));
}

function readSelection() {
  if (typeof window === "undefined") return [];
  try {
    return parseICloudAccountSelection(window.localStorage.getItem(storageKey));
  } catch {
    return [];
  }
}

function persistSelection(accountIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (accountIds.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(accountIds));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage can be unavailable in private browsing; selection still works for this page session.
  }
}

function sameAccountIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function useICloudAccountSelection({
  enabled,
  loading,
  sessionsLoaded,
  sessions,
  sessionsError,
}: {
  enabled: boolean;
  loading: boolean;
  sessionsLoaded: boolean;
  sessions: ICloudSession[];
  sessionsError: string;
}) {
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(readSelection);

  useEffect(() => persistSelection(selectedAccountIds), [selectedAccountIds]);

  useEffect(() => {
    if (!enabled || loading || !sessionsLoaded || sessionsError) return;
    setSelectedAccountIds((current) => {
      const next = availableICloudAccountIds(current, sessions);
      return sameAccountIds(current, next) ? current : next;
    });
  }, [enabled, loading, sessionsLoaded, sessions, sessionsError]);

  const toggleAccount = useCallback((id: string, checked: boolean) => {
    id = id.trim();
    if (!id) return;
    setSelectedAccountIds((current) =>
      checked ? normalizeICloudAccountIds([...current, id]) : current.filter((item) => item !== id),
    );
  }, []);

  return { selectedAccountIds, toggleAccount };
}
