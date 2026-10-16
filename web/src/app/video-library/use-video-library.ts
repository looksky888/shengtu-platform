import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteVideoAsset,
  fetchVideoAssets,
  updateVideoVisibility,
  type VideoAsset,
  type VideoLibraryScope,
} from "@/lib/video-task-api";

export function useVideoLibrary(enabled = true, initialScope: VideoLibraryScope = "mine") {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scope, setScope] = useState<VideoLibraryScope>(initialScope);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | VideoAsset["visibility"]>("all");
  const [selectedIDs, setSelectedIDs] = useState<Record<string, boolean>>({});
  const [selectedAsset, setSelectedAsset] = useState<VideoAsset | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<VideoAsset[]>([]);
  const [deletingTaskID, setDeletingTaskID] = useState("");
  const [visibilityMutatingID, setVisibilityMutatingID] = useState("");
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const filteredAssets = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return assets.filter((asset) => {
      if (visibilityFilter !== "all" && asset.visibility !== visibilityFilter) return false;
      if (!keyword) return true;
      return [asset.prompt, asset.owner_name, asset.owner_id, asset.model, asset.resolution_name, asset.task_id]
        .some((value) => String(value || "").toLowerCase().includes(keyword));
    });
  }, [assets, searchKeyword, visibilityFilter]);
  const selectedAssets = useMemo(() => filteredAssets.filter((asset) => selectedIDs[asset.id]), [filteredAssets, selectedIDs]);
  const allFilteredSelected = filteredAssets.length > 0 && selectedAssets.length === filteredAssets.length;

  const load = useCallback(async (signal?: AbortSignal, requestedScope = scope) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const requestID = ++loadRequestRef.current;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    setLoading(true);
    try {
      const result = await fetchVideoAssets(requestedScope, { signal: controller.signal });
      if (requestID !== loadRequestRef.current || controller.signal.aborted) return;
      setAssets(result.items);
      setTotal(result.total);
      setNextCursor(result.next_cursor || "");
      setHasMore(Boolean(result.has_more));
      setScope(result.scope);
      setSelectedIDs({});
      setError("");
    } catch (loadError) {
      if (requestID !== loadRequestRef.current || controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "读取视频库失败");
    } finally {
      signal?.removeEventListener("abort", abortFromCaller);
      if (requestID === loadRequestRef.current && !controller.signal.aborted) {
        setLoading(false);
        loadAbortRef.current = null;
      }
    }
  }, [scope]);

  useEffect(() => {
    if (!enabled) return;
    void load(undefined, scope);
    return () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [enabled, load, scope]);

  useEffect(() => {
    if (enabled) setScope(initialScope);
  }, [enabled, initialScope]);

  function changeScope(next: VideoLibraryScope) {
    if (next === scope) return;
    setAssets([]);
    setTotal(0);
    setNextCursor("");
    setHasMore(false);
    setError("");
    setSelectedIDs({});
    setScope(next);
  }

  function changeSearchKeyword(value: string) {
    setSearchKeyword(value);
    setSelectedIDs({});
  }

  function changeVisibilityFilter(value: "all" | VideoAsset["visibility"]) {
    setVisibilityFilter(value);
    setSelectedIDs({});
  }

  function remove(asset: VideoAsset) {
    setDeleteTargets([asset]);
  }

  async function confirmRemove() {
    const targets = deleteTargets;
    if (!targets.length) return;
    setDeletingTaskID(targets.length === 1 ? targets[0].id : "bulk");
    try {
      const deletedIDs = new Set<string>();
      const failures: string[] = [];
      for (const asset of targets) {
        try {
          await deleteVideoAsset(asset.id);
          deletedIDs.add(asset.id);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : asset.task_id);
        }
      }
      setAssets((current) => current.filter((item) => !deletedIDs.has(item.id)));
      setTotal((current) => Math.max(0, current - deletedIDs.size));
      setSelectedIDs((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !deletedIDs.has(id))));
      if (selectedAsset && deletedIDs.has(selectedAsset.id)) setSelectedAsset(null);
      setDeleteTargets([]);
      if (failures.length) toast.error(`成功删除 ${deletedIDs.size} 个，失败 ${failures.length} 个`);
      else toast.success(`已删除 ${deletedIDs.size} 个视频`);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "删除视频失败");
    } finally {
      setDeletingTaskID("");
    }
  }

  async function setVisibility(asset: VideoAsset, visibility: VideoAsset["visibility"]) {
    setVisibilityMutatingID(asset.id);
    try {
      const result = await updateVideoVisibility(asset.id, visibility);
      setAssets((current) => current.map((item) => item.id === asset.id ? result.item : item));
      setSelectedAsset((current) => current?.id === asset.id ? result.item : current);
      toast.success(visibility === "public" ? "视频已公开" : "视频已设为私有");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "更新视频公开状态失败");
    } finally {
      setVisibilityMutatingID("");
    }
  }

  async function setSelectedVisibility(visibility: VideoAsset["visibility"]) {
    if (!selectedAssets.length || visibilityMutatingID) return;
    setVisibilityMutatingID(`bulk:${visibility}`);
    const updated = new Map<string, VideoAsset>();
    let failed = 0;
    for (const asset of selectedAssets.filter((item) => item.visibility !== visibility)) {
      try {
        const result = await updateVideoVisibility(asset.id, visibility);
        updated.set(asset.id, result.item);
      } catch {
        failed += 1;
      }
    }
    setAssets((current) => current.map((item) => updated.get(item.id) || item));
    setSelectedAsset((current) => current ? updated.get(current.id) || current : current);
    setVisibilityMutatingID("");
    if (failed) toast.error(`已更新 ${updated.size} 个，失败 ${failed} 个`);
    else toast.success(visibility === "public" ? "所选视频已公开" : "所选视频已设为私有");
  }

  function toggleSelected(id: string) {
    setSelectedIDs((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const filteredIDs = new Set(filteredAssets.map((asset) => asset.id));
      setSelectedIDs((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !filteredIDs.has(id))));
      return;
    }
    setSelectedIDs((current) => ({ ...current, ...Object.fromEntries(filteredAssets.map((asset) => [asset.id, true])) }));
  }

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchVideoAssets(scope, { cursor: nextCursor });
      setAssets((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotal(result.total);
      setNextCursor(result.next_cursor || "");
      setHasMore(Boolean(result.has_more));
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "加载更多视频失败");
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    assets,
    filteredAssets,
    total,
    hasMore,
    loadingMore,
    scope,
    loading,
    error,
    searchKeyword,
    setSearchKeyword: changeSearchKeyword,
    visibilityFilter,
    setVisibilityFilter: changeVisibilityFilter,
    selectedIDs,
    selectedAssets,
    allFilteredSelected,
    selectedAsset,
    deleteTargets,
    deletingTaskID,
    visibilityMutatingID,
    load,
    changeScope,
    remove,
    confirmRemove,
    setDeleteTargets,
    setSelectedVisibility,
    toggleSelected,
    toggleAllFiltered,
    setVisibility,
    loadMore,
    selectAsset: setSelectedAsset,
  };
}

export type VideoLibraryController = ReturnType<typeof useVideoLibrary>;
