import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cancelCreationTask, fetchCreationTasks, type CreationTask } from "@/lib/api";
import { fetchCreationPricing } from "@/lib/settings-api";
import {
  submitVideoGeneration,
  uploadVideoInput,
  deleteVideoReferenceAsset,
  fetchVideoAssets,
  fetchVideoReferenceAssets,
  uploadVideoReferenceAsset,
  type VideoGenerationRequest,
  type VideoInputUpload,
  type VideoReferenceAsset,
} from "@/lib/video-task-api";
import {
  LEGACY_VIDEO_TASK_KEY,
  MAX_RECENT_VIDEO_TAKES,
  normalizeVideoModel,
  normalizeVideoPreset,
  normalizeVideoResolution,
  normalizeVideoSeconds,
  normalizeVideoSize,
  ratioForVideoSize,
  readRecentVideoTakes,
  recentVideoTakesStorageKey,
  upsertRecentVideoTake,
  videoTaskStorageKey,
  writeRecentVideoTakes,
  type RecentVideoTake,
} from "@/app/video/video-task-storage";
import type { VideoPreview } from "@/components/video-preview-dialog";
import type { StoredAuthSession } from "@/store/auth";
import { createRequestId } from "@/lib/request-id";

const TERMINAL_STATUSES = new Set<CreationTask["status"]>(["success", "error", "cancelled"]);

export type VideoInputMode = "t2v" | "i2v" | "ref";

function readTaskID(storageKey: string) {
  if (typeof window === "undefined" || !storageKey) return "";
  try {
    return window.localStorage.getItem(storageKey) || "";
  } catch {
    return "";
  }
}

function writeTaskID(storageKey: string, taskID: string) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    if (taskID) {
      window.localStorage.setItem(storageKey, taskID);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage errors so active video tasks still proceed in memory.
  }
}

function newTaskID() {
  return createRequestId("video");
}

export function useVideoCreation(session: StoredAuthSession | null | undefined) {
  const taskStorageKey = videoTaskStorageKey(session);
  const recentTakesKey = recentVideoTakesStorageKey(session);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<VideoGenerationRequest["seconds"]>(6);
  const [size, setSize] = useState<VideoGenerationRequest["size"]>("720x1280");
  const [resolutionName, setResolutionName] = useState<VideoGenerationRequest["resolution_name"]>("720p");
  const [preset, setPreset] = useState<VideoGenerationRequest["preset"]>("custom");
  const [model, setModel] = useState<VideoGenerationRequest["model"]>("grok-imagine-video-1.5");
  const [inputMode, setInputMode] = useState<VideoInputMode>("t2v");
  const [inputReference, setInputReference] = useState("");
  const [uploadedReference, setUploadedReference] = useState<(VideoInputUpload & { preview_url: string }) | null>(null);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [uploadingReferences, setUploadingReferences] = useState(false);
  const [referenceAssets, setReferenceAssets] = useState<VideoReferenceAsset[]>([]);
  const [referenceAssetsCursor, setReferenceAssetsCursor] = useState("");
  const [referenceAssetsHasMore, setReferenceAssetsHasMore] = useState(false);
  const [referenceAssetsLoadingMore, setReferenceAssetsLoadingMore] = useState(false);
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>([]);
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
  const [referenceLibraryLoading, setReferenceLibraryLoading] = useState(false);
  const [taskScope, setTaskScope] = useState(() => ({
    storageKey: taskStorageKey,
    taskID: readTaskID(taskStorageKey),
  }));
  const taskID = taskScope.storageKey === taskStorageKey ? taskScope.taskID : "";
  const [task, setTask] = useState<CreationTask | null>(null);
  const [recentTakes, setRecentTakes] = useState<RecentVideoTake[]>(() =>
    readRecentVideoTakes(recentTakesKey),
  );
  const [selectedTakeId, setSelectedTakeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState("");
  const [creditCostPerSecond, setCreditCostPerSecond] = useState(1);
  const [previewVideo, setPreviewVideo] = useState<(VideoPreview & { taskID: string }) | null>(null);
  const observedActiveTaskRef = useRef(false);

  const formSnapshotRef = useRef({
    prompt,
    seconds,
    size,
    resolutionName,
    preset,
    model,
  });
  formSnapshotRef.current = {
    prompt,
    seconds,
    size,
    resolutionName,
    preset,
    model,
  };

  useEffect(() => {
    writeTaskID(LEGACY_VIDEO_TASK_KEY, "");
  }, []);

  useEffect(() => {
    setTaskScope({ storageKey: taskStorageKey, taskID: readTaskID(taskStorageKey) });
    setTask(null);
    setPollError("");
    observedActiveTaskRef.current = false;
  }, [taskStorageKey]);

  useEffect(() => {
    setRecentTakes(readRecentVideoTakes(recentTakesKey));
    setSelectedTakeId("");
    if (!recentTakesKey) return;

    const abortController = new AbortController();
    fetchVideoAssets("mine", {
      limit: MAX_RECENT_VIDEO_TAKES,
      signal: abortController.signal,
    })
      .then((page) => {
        if (abortController.signal.aborted) return;
        const cloudTakes: RecentVideoTake[] = (page.items || [])
          .filter((asset) => Boolean(asset.url))
          .map((asset) => {
            const normalizedSize = normalizeVideoSize(asset.size);
            return {
              taskId: asset.task_id || asset.id,
              prompt: (asset.prompt || "").trim(),
              ratio: ratioForVideoSize(normalizedSize),
              size: normalizedSize,
              seconds: normalizeVideoSeconds(asset.seconds),
              resolutionName: normalizeVideoResolution(asset.resolution_name),
              preset: normalizeVideoPreset(asset.preset),
              model: normalizeVideoModel(asset.model),
              status: "success" as const,
              videoUrl: asset.url,
              createdAt: asset.created_at || new Date().toISOString(),
            };
          });
        if (cloudTakes.length === 0) return;
        setRecentTakes((prev) => {
          const merged = [...prev];
          for (const cloudTake of cloudTakes) {
            const existingIndex = merged.findIndex((item) => item.taskId === cloudTake.taskId);
            if (existingIndex >= 0) {
              merged[existingIndex] = {
                ...merged[existingIndex],
                prompt: merged[existingIndex].prompt || cloudTake.prompt,
                status: "success",
                videoUrl: cloudTake.videoUrl || merged[existingIndex].videoUrl,
              };
            } else if (merged.length < MAX_RECENT_VIDEO_TAKES) {
              merged.push(cloudTake);
            }
          }
          const trimmed = merged.slice(0, MAX_RECENT_VIDEO_TAKES);
          writeRecentVideoTakes(recentTakesKey, trimmed);
          return trimmed;
        });
      })
      .catch(() => undefined);

    return () => {
      abortController.abort();
    };
  }, [recentTakesKey]);

  useEffect(() => {
    let disposed = false;
    fetchCreationPricing().then((data) => {
      if (!disposed) setCreditCostPerSecond(Math.max(1, Number(data.video_credit_cost_per_second) || 1));
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!taskID) return;
    let disposed = false;
    let timer: number | undefined;

    const sync = async () => {
      try {
        const result = await fetchCreationTasks([taskID]);
        if (disposed) return;
        const current = result.items[0];
        if (!current) {
          setTask(null);
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
          writeTaskID(taskStorageKey, "");
          setPollError("");
          return;
        }

        const currentVideo = current.data?.find(
          (item) => item.url && item.content_type?.startsWith("video/"),
        );

        if (current.status === "success" && taskStorageKey) {
          writeTaskID(taskStorageKey, "");
        }

        if (!TERMINAL_STATUSES.has(current.status)) {
          observedActiveTaskRef.current = true;
        }

        setRecentTakes((prev) => {
          const existing = prev.find((item) => item.taskId === current.id);
          if (!existing && !observedActiveTaskRef.current) {
            return prev;
          }
          const snap = formSnapshotRef.current;
          const resolvedSize = existing?.size || snap.size;
          const next = upsertRecentVideoTake(prev, {
            taskId: current.id,
            prompt: existing?.prompt || snap.prompt.trim(),
            ratio: existing?.ratio || ratioForVideoSize(resolvedSize),
            size: resolvedSize,
            seconds: existing?.seconds || snap.seconds,
            resolutionName: existing?.resolutionName || snap.resolutionName,
            preset: existing?.preset || snap.preset,
            model: existing?.model || snap.model,
            status: current.status,
            videoUrl: currentVideo?.url || existing?.videoUrl,
            createdAt: existing?.createdAt || new Date().toISOString(),
          });
          writeRecentVideoTakes(recentTakesKey, next);
          return next;
        });

        if (current.status === "success" && !observedActiveTaskRef.current) {
          setTask(null);
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
          setPollError("");
          return;
        }

        setTask(current);
        if (current.status === "success") {
          setSelectedTakeId(current.id);
        }
        setPollError("");
        if (!TERMINAL_STATUSES.has(current.status)) {
          timer = window.setTimeout(sync, 2000);
        }
      } catch (error) {
        if (disposed) return;
        setPollError(error instanceof Error ? error.message : "读取视频任务失败");
        timer = window.setTimeout(sync, 4000);
      }
    };

    void sync();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [recentTakesKey, taskID, taskStorageKey]);

  const video = useMemo(
    () => task?.data?.find((item) => item.url && item.content_type?.startsWith("video/")),
    [task],
  );

  const selectedTake = useMemo(
    () => recentTakes.find((item) => item.taskId === selectedTakeId) || null,
    [recentTakes, selectedTakeId],
  );

  useEffect(() => {
    const previewURL = uploadedReference?.preview_url;
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    };
  }, [uploadedReference?.preview_url]);

  function setInputReferenceURL(value: string) {
    setInputReference(value);
    if (value.trim()) setUploadedReference(null);
  }

  async function uploadReference(file: File) {
    setUploadingReference(true);
    try {
      const uploaded = await uploadVideoInput(file);
      setInputReference("");
      setUploadedReference({ ...uploaded, preview_url: URL.createObjectURL(file) });
      toast.success("首帧图片已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "首帧图片上传失败");
    } finally {
      setUploadingReference(false);
    }
  }

  function clearUploadedReference() {
    setUploadedReference(null);
  }

  async function uploadReferences(files: File[]) {
    const selected = files.slice(0, 20);
    if (!selected.length) {
      toast.error("请选择参考图片");
      return;
    }
    setUploadingReferences(true);
    let uploadedCount = 0;
    try {
      for (const file of selected) {
        const item = await uploadVideoReferenceAsset(file);
        uploadedCount += 1;
        setReferenceAssets((current) => [item, ...current.filter((asset) => asset.id !== item.id)]);
      }
      toast.success(`已上传 ${uploadedCount} 张参考图片，请勾选本次要使用的图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参考图片上传失败");
    } finally {
      setUploadingReferences(false);
    }
  }

  async function openReferenceLibrary() {
    setReferenceLibraryOpen(true);
    setReferenceLibraryLoading(true);
    try {
      const data = await fetchVideoReferenceAssets();
      setReferenceAssets(data.items || []);
      setReferenceAssetsCursor(data.next_cursor || "");
      setReferenceAssetsHasMore(Boolean(data.has_more));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取参考图资产库失败");
    } finally {
      setReferenceLibraryLoading(false);
    }
  }

  async function loadMoreReferenceAssets() {
    if (!referenceAssetsHasMore || !referenceAssetsCursor || referenceAssetsLoadingMore) return;
    setReferenceAssetsLoadingMore(true);
    try {
      const data = await fetchVideoReferenceAssets({ cursor: referenceAssetsCursor });
      setReferenceAssets((current) => [...current, ...(data.items || []).filter((item) => !current.some((existing) => existing.id === item.id))]);
      setReferenceAssetsCursor(data.next_cursor || "");
      setReferenceAssetsHasMore(Boolean(data.has_more));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多参考图失败");
    } finally {
      setReferenceAssetsLoadingMore(false);
    }
  }

  function toggleReferenceAsset(id: string) {
    setSelectedReferenceAssetIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 7 ? current : [...current, id]);
  }

  function setSelectedReferenceAssets(ids: string[]) {
    const available = new Set(referenceAssets.map((asset) => asset.id));
    const nextIds = Array.from(new Set(ids)).filter((id) => available.has(id)).slice(0, 7);
    setSelectedReferenceAssetIds(nextIds);
    if (nextIds.length > 0) {
      setInputMode("ref");
    }
  }

  async function removeReferenceAsset(id: string) {
    try {
      await deleteVideoReferenceAsset(id);
      setReferenceAssets((current) => current.filter((asset) => asset.id !== id));
      setSelectedReferenceAssetIds((current) => current.filter((value) => value !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除参考图失败");
    }
  }

  async function submit() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error("请填写视频提示词");
      return;
    }
    setSubmitting(true);
    setPollError("");
    try {
      const id = newTaskID();
      const firstFrameReference = uploadedReference?.input_reference || inputReference.trim();
      const modeScopedReferences: Pick<VideoGenerationRequest, "image_reference" | "reference_images"> =
        inputMode === "i2v"
          ? firstFrameReference
            ? { image_reference: firstFrameReference }
            : {}
          : inputMode === "ref"
            ? selectedReferenceAssetIds.length > 0
              ? { reference_images: selectedReferenceAssetIds.map((assetId) => `video-ref:${assetId}`) }
              : {}
            : {};

      const created = await submitVideoGeneration({
        client_task_id: id,
        prompt: normalizedPrompt,
        model,
        seconds,
        size,
        resolution_name: resolutionName,
        preset,
        ...modeScopedReferences,
      });
      const taskKeyId = created.id || id;
      writeTaskID(taskStorageKey, taskKeyId);
      observedActiveTaskRef.current = true;
      setTask(created);
      setTaskScope({ storageKey: taskStorageKey, taskID: taskKeyId });
      setSelectedTakeId(taskKeyId);
      setRecentTakes((prev) => {
        const next = upsertRecentVideoTake(
          prev,
          {
            taskId: taskKeyId,
            prompt: normalizedPrompt,
            ratio: ratioForVideoSize(size),
            size,
            seconds,
            resolutionName,
            preset,
            model,
            status: created.status,
            createdAt: new Date().toISOString(),
          },
          { moveToFront: true },
        );
        writeRecentVideoTakes(recentTakesKey, next);
        return next;
      });
      toast.success("视频任务已提交");
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        window.requestAnimationFrame(() => {
          document.getElementById("video-stage-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交视频任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!taskID || !task || TERMINAL_STATUSES.has(task.status)) return;
    try {
      const cancelled = await cancelCreationTask(taskID);
      setTask(cancelled);
      setRecentTakes((prev) => {
        const existing = prev.find((item) => item.taskId === cancelled.id);
        if (!existing) return prev;
        const next = upsertRecentVideoTake(prev, {
          ...existing,
          status: cancelled.status,
        });
        writeRecentVideoTakes(recentTakesKey, next);
        return next;
      });
      toast.success("视频任务已取消");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消视频任务失败");
    }
  }

  function selectRecentTake(takeTaskId: string) {
    setSelectedTakeId((current) => (current === takeTaskId && takeTaskId !== task?.id ? "" : takeTaskId));
  }

  function clearSelectedTake() {
    setSelectedTakeId("");
  }

  function applyRecentTakePrompt(take: RecentVideoTake) {
    if (take.prompt) {
      setPrompt(take.prompt);
    }
    setSize(take.size);
    setSeconds(take.seconds);
    setResolutionName(take.resolutionName);
    setPreset(take.preset);
    setModel(take.model);
    toast.success(take.prompt ? "已填入提示词与镜头参数" : "已同步镜头参数");
  }

  function appendCameraStyleChip(descriptor: string) {
    const clean = descriptor.trim();
    if (!clean) return;
    setPrompt((current) => {
      const base = current.trim();
      if (!base) return clean;
      if (base.includes(clean)) return current;
      const needsSeparator = !/[，,。.；;、]$/.test(base);
      return `${base}${needsSeparator ? "，" : ""}${clean}`;
    });
  }

  function watchVideo() {
    if (selectedTake && selectedTake.taskId !== task?.id && selectedTake.videoUrl) {
      setPreviewVideo({
        url: selectedTake.videoUrl,
        taskID: selectedTake.taskId,
        prompt: selectedTake.prompt,
        seconds: selectedTake.seconds,
        size: selectedTake.size,
        resolution: selectedTake.resolutionName,
      });
      return;
    }
    if (!task || !video?.url) return;
    const matchedTake = recentTakes.find((item) => item.taskId === task.id);
    setPreviewVideo({
      url: video.url,
      taskID: task.id,
      prompt: matchedTake?.prompt || prompt.trim(),
      seconds: video.seconds || matchedTake?.seconds || seconds,
      size: matchedTake?.size || size,
      resolution: matchedTake?.resolutionName || resolutionName,
    });
    writeTaskID(taskStorageKey, "");
  }

  function closePreview() {
    setPreviewVideo(null);
  }

  return {
    prompt, setPrompt, seconds, setSeconds, size, setSize, resolutionName, setResolutionName,
    model, setModel,
    inputMode, setInputMode,
    preset, setPreset, inputReference, setInputReferenceURL, uploadedReference,
    uploadingReference, uploadReference, clearUploadedReference,
    uploadingReferences, uploadReferences,
    referenceAssets, selectedReferenceAssetIds, referenceLibraryOpen, setReferenceLibraryOpen, referenceLibraryLoading,
    referenceAssetsHasMore, referenceAssetsLoadingMore, loadMoreReferenceAssets,
    openReferenceLibrary, toggleReferenceAsset, setSelectedReferenceAssets, removeReferenceAsset,
    task, video, submitting, pollError, submit, cancel, creditCostPerSecond,
    recentTakes, selectedTakeId, selectedTake, selectRecentTake, clearSelectedTake, applyRecentTakePrompt, appendCameraStyleChip,
    previewVideo, watchVideo, closePreview,
  };
}

export type VideoCreationController = ReturnType<typeof useVideoCreation>;
