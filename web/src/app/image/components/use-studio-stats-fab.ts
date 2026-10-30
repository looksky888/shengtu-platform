"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getTaskQueueItems, useImageConversationsForQueue } from "@/components/image-task-queue-utils";
import { getPageVisibilitySnapshot } from "@/lib/page-visibility";

import { formatPercent, isElevatedFailRate } from "./studio-stats-fab-utils";
import { fetchSharedStudioStats, useSharedStudioTelemetry } from "./studio-stats-store";

const TERMINAL_REFRESH_DEBOUNCE_MS = 900;

export function useStudioStatsFab() {
  const conversations = useImageConversationsForQueue();
  const [open, setOpen] = useState(false);
  const { stats, onlineAccounts, loading, error, refreshTelemetry } = useSharedStudioTelemetry(open);
  const busyKeysRef = useRef<Set<string>>(new Set());
  const terminalRefreshTimerRef = useRef<number | null>(null);
  const terminalRefreshFollowUpRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const rateText = formatPercent(stats.successRate);
  const hasData = stats.successImages + stats.failedImages > 0;
  const elevatedFail = isElevatedFailRate(stats.successImages, stats.failedImages);

  const clearTerminalRefreshTimers = useCallback(() => {
    if (terminalRefreshTimerRef.current != null) {
      window.clearTimeout(terminalRefreshTimerRef.current);
      terminalRefreshTimerRef.current = null;
    }
    if (terminalRefreshFollowUpRef.current != null) {
      window.clearTimeout(terminalRefreshFollowUpRef.current);
      terminalRefreshFollowUpRef.current = null;
    }
  }, []);

  const scheduleTerminalRefresh = useCallback(() => {
    clearTerminalRefreshTimers();
    terminalRefreshTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !getPageVisibilitySnapshot()) return;
      void fetchSharedStudioStats({ silent: true, force: true });
      terminalRefreshFollowUpRef.current = window.setTimeout(() => {
        if (!mountedRef.current || !getPageVisibilitySnapshot()) return;
        void fetchSharedStudioStats({ silent: true, force: true });
      }, 1800);
    }, TERMINAL_REFRESH_DEBOUNCE_MS);
  }, [clearTerminalRefreshTimers]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTerminalRefreshTimers();
    };
  }, [clearTerminalRefreshTimers]);

  useEffect(() => {
    const busy = new Set(
      getTaskQueueItems(conversations).map((item) => `${item.conversationId}:${item.turn.id}`),
    );
    let finished = false;
    busyKeysRef.current.forEach((key) => {
      if (!busy.has(key)) finished = true;
    });
    if (finished) scheduleTerminalRefresh();
    busyKeysRef.current = busy;
  }, [conversations, scheduleTerminalRefresh]);

  const setRefreshToken = useCallback(
    (_updater?: number | ((value: number) => number)) => {
      refreshTelemetry(false);
    },
    [refreshTelemetry],
  );

  return {
    open,
    setOpen,
    stats,
    onlineAccounts,
    loading,
    error,
    elevatedFail,
    hasData,
    rateText,
    setRefreshToken,
  };
}

export type StudioStatsFabState = ReturnType<typeof useStudioStatsFab>;
