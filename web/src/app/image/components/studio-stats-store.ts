import { useCallback, useEffect, useSyncExternalStore } from "react";

import { fetchStudioImageTaskTodayStats } from "@/lib/api";
import { getPageVisibilitySnapshot } from "@/lib/page-visibility";
import { httpRequest } from "@/lib/request";

import { emptyStudioStatsView, mapLedgerStats, type StudioStatsView } from "./studio-stats-fab-utils";

export type StudioTelemetrySnapshot = {
  stats: StudioStatsView;
  onlineAccounts: number | null;
  loading: boolean;
  error: string | null;
  lastStatsFetchedAt: number;
  lastHealthFetchedAt: number;
};

const POLL_OPEN_MS = 5000;
const POLL_CLOSED_MS = 60000;
const MIN_OPEN_REFRESH_GAP_MS = 4000;

let snapshot: StudioTelemetrySnapshot = {
  stats: emptyStudioStatsView(),
  onlineAccounts: null,
  loading: true,
  error: null,
  lastStatsFetchedAt: 0,
  lastHealthFetchedAt: 0,
};

const listeners = new Set<() => void>();
let subscriberCount = 0;
let openSubscriberCount = 0;
let pollTimer: number | null = null;
let inFlightStats: Promise<void> | null = null;
let inFlightHealth: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(patch: Partial<StudioTelemetrySnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function fetchSharedStudioStats(options: { silent?: boolean; force?: boolean } = {}): Promise<void> {
  const { silent = false, force = false } = options;
  if (!force && inFlightStats) return inFlightStats;
  if (!silent) {
    updateSnapshot({ loading: true });
  }
  const task = fetchStudioImageTaskTodayStats()
    .then((raw) => {
      updateSnapshot({
        stats: mapLedgerStats(raw),
        loading: false,
        error: null,
        lastStatsFetchedAt: Date.now(),
      });
    })
    .catch((err: unknown) => {
      updateSnapshot({
        loading: false,
        error: err instanceof Error ? err.message : "加载生图统计失败",
      });
    })
    .finally(() => {
      if (inFlightStats === task) {
        inFlightStats = null;
      }
    });
  inFlightStats = task;
  return task;
}

export function fetchSharedOnlinePool(options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;
  if (!force && inFlightHealth) return inFlightHealth;
  const task = httpRequest<{ account_pool?: { available?: number; free_slots?: number } }>("/health", {
    method: "GET",
    headers: { "Cache-Control": "no-cache" },
  })
    .then((health) => {
      const pool = health?.account_pool;
      if (!pool) return;
      const count = typeof pool.available === "number" ? pool.available : pool.free_slots;
      if (typeof count === "number" && Number.isFinite(count)) {
        updateSnapshot({
          onlineAccounts: Math.max(0, Math.floor(count)),
          lastHealthFetchedAt: Date.now(),
        });
      }
    })
    .catch(() => {
      // Preserve last known online count on transient network jitter.
    })
    .finally(() => {
      if (inFlightHealth === task) {
        inFlightHealth = null;
      }
    });
  inFlightHealth = task;
  return task;
}

function syncPollingLoop() {
  if (typeof window === "undefined") return;
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (subscriberCount <= 0 || !getPageVisibilitySnapshot()) {
    return;
  }
  const interval = openSubscriberCount > 0 ? POLL_OPEN_MS : POLL_CLOSED_MS;
  pollTimer = window.setInterval(() => {
    if (!getPageVisibilitySnapshot()) return;
    void fetchSharedStudioStats({ silent: true });
    if (Date.now() - snapshot.lastHealthFetchedAt >= POLL_CLOSED_MS - 1000) {
      void fetchSharedOnlinePool();
    }
  }, interval);
}

function handleVisibilityChange() {
  if (subscriberCount <= 0) return;
  if (getPageVisibilitySnapshot()) {
    if (Date.now() - snapshot.lastStatsFetchedAt >= MIN_OPEN_REFRESH_GAP_MS) {
      void fetchSharedStudioStats({ silent: snapshot.lastStatsFetchedAt > 0 });
    }
    if (Date.now() - snapshot.lastHealthFetchedAt >= POLL_CLOSED_MS) {
      void fetchSharedOnlinePool();
    }
  }
  syncPollingLoop();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1 && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  if (getPageVisibilitySnapshot()) {
    if (snapshot.lastStatsFetchedAt === 0 || Date.now() - snapshot.lastStatsFetchedAt >= POLL_CLOSED_MS) {
      void fetchSharedStudioStats({ silent: snapshot.lastStatsFetchedAt > 0 });
    }
    if (snapshot.lastHealthFetchedAt === 0 || Date.now() - snapshot.lastHealthFetchedAt >= POLL_CLOSED_MS) {
      void fetchSharedOnlinePool();
    }
  }
  syncPollingLoop();
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    syncPollingLoop();
  };
}

function getSnapshot() {
  return snapshot;
}

export function useSharedStudioTelemetry(isOpen: boolean) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!isOpen) return;
    openSubscriberCount += 1;
    if (getPageVisibilitySnapshot() && Date.now() - snapshot.lastStatsFetchedAt >= MIN_OPEN_REFRESH_GAP_MS) {
      void fetchSharedStudioStats({ silent: true });
    }
    if (getPageVisibilitySnapshot() && Date.now() - snapshot.lastHealthFetchedAt >= 15000) {
      void fetchSharedOnlinePool();
    }
    syncPollingLoop();
    return () => {
      openSubscriberCount = Math.max(0, openSubscriberCount - 1);
      syncPollingLoop();
    };
  }, [isOpen]);

  const refreshTelemetry = useCallback((silent = false) => {
    void fetchSharedStudioStats({ silent, force: true });
    void fetchSharedOnlinePool({ force: true });
  }, []);

  return {
    ...state,
    refreshTelemetry,
  };
}
