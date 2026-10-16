"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";

import { fetchStudioImageTaskTodayStats } from "@/lib/api";
import { getTaskQueueItems, useImageConversationsForQueue } from "@/components/image-task-queue-utils";
import { getPageVisibilitySnapshot } from "@/lib/page-visibility";
import { usePageVisible } from "@/lib/use-page-visible";

import {
  clampFabPosition,
  defaultFabPosition,
  emptyStudioStatsView,
  formatBallCount,
  formatPercent,
  isElevatedFailRate,
  loadFabPosition,
  mapLedgerStats,
  saveFabPosition,
  snapFabToEdge,
  type FabPosition,
  type StudioStatsView,
} from "./studio-stats-fab-utils";

const BALL = 64;
const PANEL_W = 340;
const POLL_OPEN_MS = 5000;
const POLL_CLOSED_MS = 60000;
const TERMINAL_REFRESH_DEBOUNCE_MS = 900;

export function useStudioStatsFab() {
  const reduceMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const conversations = useImageConversationsForQueue();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FabPosition>(() => defaultFabPosition(BALL, 24));
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<StudioStatsView>(() => emptyStudioStatsView());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [bump, setBump] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const busyKeysRef = useRef<Set<string>>(new Set());
  const terminalRefreshTimerRef = useRef<number | null>(null);
  const terminalRefreshFollowUpRef = useRef<number | null>(null);
  const prevSuccessRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const statsAbortRef = useRef<AbortController | null>(null);
  const statsRequestSeq = useRef(0);

  const x = useMotionValue(pos.x);
  const y = useMotionValue(pos.y);
  const springX = useSpring(x, { stiffness: 420, damping: 36, mass: 0.7 });
  const springY = useSpring(y, { stiffness: 420, damping: 36, mass: 0.7 });

  const rateText = formatPercent(stats.successRate);
  const hasData = stats.successImages + stats.failedImages > 0;
  const elevatedFail = isElevatedFailRate(stats.successImages, stats.failedImages);
  const ballCountText = formatBallCount(stats.successImages);

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

  const loadStats = useCallback(async (silent = false) => {
    statsAbortRef.current?.abort();
    const controller = new AbortController();
    statsAbortRef.current = controller;
    const seq = ++statsRequestSeq.current;
    if (!silent) setLoading(true);
    try {
      const next = mapLedgerStats(await fetchStudioImageTaskTodayStats({ signal: controller.signal }));
      if (!mountedRef.current || seq !== statsRequestSeq.current) return;
      if (prevSuccessRef.current !== null && next.successImages > prevSuccessRef.current) {
        setBump((n) => n + 1);
      }
      prevSuccessRef.current = next.successImages;
      setStats(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || seq !== statsRequestSeq.current) return;
      // Keep last error visible on silent refresh so poll failures aren't invisible.
      setError(err instanceof Error ? err.message : "加载生图统计失败");
    } finally {
      if (mountedRef.current && seq === statsRequestSeq.current) setLoading(false);
    }
  }, []);

  const scheduleTerminalRefresh = useCallback(() => {
    clearTerminalRefreshTimers();
    // Ledger is written when the server finishes the task; small delay then poll.
    terminalRefreshTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !getPageVisibilitySnapshot()) return;
      void loadStats(true);
      // Second tick covers ledger write lag / multi-image batches (cleaned on unmount).
      terminalRefreshFollowUpRef.current = window.setTimeout(() => {
        if (!mountedRef.current || !getPageVisibilitySnapshot()) return;
        void loadStats(true);
      }, 1800);
    }, TERMINAL_REFRESH_DEBOUNCE_MS);
  }, [clearTerminalRefreshTimers, loadStats]);

  useEffect(() => {
    mountedRef.current = true;
    const saved = loadFabPosition();
    const next = clampFabPosition(saved ?? defaultFabPosition(BALL, 24), BALL, 8);
    setPos(next);
    x.set(next.x);
    y.set(next.y);
    setReady(true);
    return () => {
      mountedRef.current = false;
      statsAbortRef.current?.abort();
      clearTerminalRefreshTimers();
    };
  }, [clearTerminalRefreshTimers, x, y]);

  useEffect(() => {
    if (pageVisible) void loadStats();
  }, [loadStats, pageVisible, refreshToken]);

  useEffect(() => {
    if (!pageVisible) statsAbortRef.current?.abort();
  }, [pageVisible]);

  // When any local turn leaves busy state, refresh ledger-backed stats promptly.
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

  useEffect(() => {
    const onResize = () => {
      setPos((current) => {
        const next = clampFabPosition(current, BALL, 8);
        x.set(next.x);
        y.set(next.y);
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [x, y]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!pageVisible) return;
    const interval = open ? POLL_OPEN_MS : POLL_CLOSED_MS;
    const timer = window.setInterval(() => {
      void loadStats(true);
    }, interval);
    return () => window.clearInterval(timer);
  }, [loadStats, open, pageVisible]);

  useEffect(() => {
    if (!open || !getPageVisibilitySnapshot()) return;
    void loadStats(true);
  }, [loadStats, open]);

  const commitPos = useCallback(
    (next: FabPosition, snap = false) => {
      const clamped = clampFabPosition(snap ? snapFabToEdge(next, BALL, 16) : next, BALL, 8);
      setPos(clamped);
      x.set(clamped.x);
      y.set(clamped.y);
      saveFabPosition(clamped);
      return clamped;
    },
    [x, y],
  );

  const panelStyle = useMemo(() => {
    if (typeof window === "undefined") return { left: 0, top: 0, transformOrigin: "100% 100%", width: PANEL_W };
    const pw = Math.min(PANEL_W, window.innerWidth - 24);
    const ph = panelRef.current?.offsetHeight || 360;
    const gap = 14;
    const ballCx = pos.x + BALL / 2;
    const ballCy = pos.y + BALL / 2;
    let left = ballCx - pw / 2;
    let top = pos.y - ph - gap;
    if (top < 12) top = Math.min(pos.y + BALL + gap, window.innerHeight - ph - 12);
    left = Math.min(window.innerWidth - pw - 12, Math.max(12, left));
    top = Math.min(window.innerHeight - ph - 12, Math.max(12, top));
    const ox = ((ballCx - left) / pw) * 100;
    const oy = ((ballCy - top) / ph) * 100;
    return {
      left,
      top,
      width: pw,
      transformOrigin: `${Math.min(100, Math.max(0, ox))}% ${Math.min(100, Math.max(0, oy))}%`,
    };
  }, [pos.x, pos.y]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const next = clampFabPosition({ x: drag.originX + dx, y: drag.originY + dy }, BALL, 8);
    setPos(next);
    x.set(next.x);
    y.set(next.y);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (!drag.moved) {
      setOpen((v) => !v);
      return;
    }
    commitPos(pos, true);
  };

  const onDoubleClick = () => {
    commitPos(defaultFabPosition(BALL, 24), false);
  };


  return {
    ready,
    open,
    setOpen,
    reduceMotion,
    stats,
    loading,
    error,
    elevatedFail,
    hasData,
    rateText,
    ballCountText,
    bump,
    wrapRef,
    panelRef,
    panelStyle,
    springX,
    springY,
    pos,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    setRefreshToken,
  };
}

export type StudioStatsFabState = ReturnType<typeof useStudioStatsFab>;
