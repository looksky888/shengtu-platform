"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { sortTasksNewestFirst } from "@/app/task-queue/task-queue-utils";
import { useTaskQueueSSE } from "@/app/task-queue/use-task-queue-sse";
import {
  batchCancelAdminImageTasks,
  cancelAdminImageTask,
  clearAdminImageTasks,
  fetchAccountPoolHealth,
  fetchAdminImageTaskLogs,
  type AccountPoolHealth,
  type CreationTask,
  type TaskExecutorsSnapshot,
  type QuarantineItem,
} from "@/lib/api";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

const PAGE_SIZE = 10;

/** Live queue tab state: list/filter/selection + pool health. */
export function useTaskQueueLive(enabled: boolean, session: StoredAuthSession) {
  const canManageTasks = hasAPIPermission(session, "POST", "/api/admin/image-task-logs");
  const [items, setItems] = useState<CreationTask[]>([]);
  const [executors, setExecutors] = useState<TaskExecutorsSnapshot | null>(null);
  const [pool, setPool] = useState<AccountPoolHealth | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineItem[]>([]);
  const [temporaryCount, setTemporaryCount] = useState(0);
  const [permanentCount, setPermanentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [onlySwitched, setOnlySwitched] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState(false);
  const cancelBatchPending = useRef(false);
  const loadRequestSeq = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const lastSilentErrorToastAtRef = useRef(0);
  const SILENT_ERROR_TOAST_COOLDOWN_MS = 30_000;

  const load = useCallback(async (silent = false) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const seq = ++loadRequestSeq.current;
    if (!silent) setIsLoading(true);
    try {
      const signalOpts = { signal: controller.signal };
      const [taskData, health] = await Promise.all([
        fetchAdminImageTaskLogs({ limit: 200, offset: 0, summary: true }, signalOpts),
        fetchAccountPoolHealth(signalOpts),
      ]);
      if (seq !== loadRequestSeq.current) return;
      setItems(sortTasksNewestFirst(taskData.items || []));
      const visibleIDs = new Set((taskData.items || []).map((item) => item.id));
      setSelected((previous) => {
        const next = Object.fromEntries(Object.entries(previous).filter(([id, on]) => on && visibleIDs.has(id)));
        return Object.keys(next).length === Object.keys(previous).length ? previous : next;
      });
      setExecutors(taskData.executors || null);
      setPool(health.pool || null);
      const rows = Array.isArray(health.quarantine) ? health.quarantine : [];
      setQuarantine(rows);
      setTemporaryCount(
        typeof health.temporary_count === "number"
          ? health.temporary_count
          : rows.filter((item) => item.grade === "temporary").length,
      );
      setPermanentCount(
        typeof health.permanent_count === "number"
          ? health.permanent_count
          : rows.filter((item) => item.grade === "permanent").length,
      );
    } catch (error) {
      if (controller.signal.aborted || seq !== loadRequestSeq.current) return;
      const message = error instanceof Error ? error.message : "加载任务队列失败";
      if (!silent) {
        toast.error(message);
      } else {
        // SSE/post-action silent refresh: surface failures, but throttle to avoid event storms.
        const now = Date.now();
        if (now - lastSilentErrorToastAtRef.current >= SILENT_ERROR_TOAST_COOLDOWN_MS) {
          lastSilentErrorToastAtRef.current = now;
          toast.error(message);
        }
      }
    } finally {
      // Latest request always clears loading so aborting a non-silent load can't stick spinner.
      if (seq === loadRequestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
    },
    [],
  );

  const silentRefresh = useCallback(() => {
    void load(true);
  }, [load]);
  useTaskQueueSSE(silentRefresh, enabled);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((item) => {
      if (status === "active" && item.status !== "running" && item.status !== "queued") return false;
      if (status !== "all" && status !== "active" && item.status !== status) return false;
      if (onlySwitched && !(item.account_switch_count && item.account_switch_count > 0)) return false;
      if (!query) return true;
      const hay = [
        item.id,
        item.owner_id,
        item.owner_name,
        item.model,
        item.account_label,
        item.error,
        item.error_code,
        item.progress_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [items, onlySwitched, q, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [status, q, onlySwitched]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  const summary = useMemo(() => {
    let running = 0;
    let success = 0;
    let failed = 0;
    for (const item of items) {
      if (item.status === "running" || item.status === "queued") running += 1;
      else if (item.status === "success") success += 1;
      else if (item.status === "error" || item.status === "cancelled") failed += 1;
    }
    return { total: items.length, running, success, failed };
  }, [items]);

  const detail = useMemo(() => items.find((item) => item.id === detailId) || null, [detailId, items]);

  const toggleAllActive = () => {
    const active = pageItems.filter((item) => item.status === "running" || item.status === "queued");
    if (!active.length) return;
    const allOn = active.every((item) => selected[item.id]);
    setSelected((prev) => {
      const next = { ...prev };
      for (const item of active) next[item.id] = !allOn;
      return next;
    });
  };

  const cancelOne = async (id: string) => {
    if (!canManageTasks) return toast.error("没有取消任务权限");
    if (cancellingId) return;
    setCancellingId(id);
    try {
      await cancelAdminImageTask(id);
      toast.success("已请求取消任务");
      void load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消任务失败");
    } finally {
      setCancellingId(null);
    }
  };

  const cancelSelected = async () => {
    if (!canManageTasks) return toast.error("没有取消任务权限");
    if (!selectedIds.length || cancelBatchPending.current) return;
    cancelBatchPending.current = true;
    try {
      const result = await batchCancelAdminImageTasks(selectedIds);
      toast.success(`已取消 ${result.cancelled ?? selectedIds.length} 个任务`);
      setSelected({});
      void load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量取消失败");
    } finally {
      cancelBatchPending.current = false;
    }
  };

  const clearDone = async (scope: "failed" | "finished") => {
    if (!canManageTasks) return toast.error("没有清理任务权限");
    setClearing(true);
    try {
      const result = await clearAdminImageTasks(scope);
      toast.success(`已清理 ${result.removed ?? 0} 条，剩余 ${result.remaining ?? 0} 条`);
      void load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理队列失败");
    } finally {
      setClearing(false);
    }
  };

  return {
    canManageTasks,
    items,
    executors,
    pool,
    quarantine,
    temporaryCount,
    permanentCount,
    isLoading,
    cancellingId,
    selected,
    setSelected,
    status,
    setStatus,
    q,
    setQ,
    onlySwitched,
    setOnlySwitched,
    detailId,
    setDetailId,
    page: safePage,
    setPage,
    clearing,
    pageSize: PAGE_SIZE,
    pageItems,
    filteredCount: filtered.length,
    totalPages,
    selectedIds,
    summary,
    detail,
    load,
    toggleAllActive,
    cancelOne,
    cancelSelected,
    clearDone,
  };
}
