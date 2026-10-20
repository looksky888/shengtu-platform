import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cancelCreationTask, fetchCreationTasks, type CreationTask } from "@/lib/api";
import { fetchCreationPricing } from "@/lib/settings-api";
import {
  submitVideoGeneration,
  uploadVideoInput,
  deleteVideoReferenceAsset,
  fetchVideoReferenceAssets,
  uploadVideoReferenceAsset,
  type VideoGenerationRequest,
  type VideoInputUpload,
  type VideoReferenceAsset,
} from "@/lib/video-task-api";
import { LEGACY_VIDEO_TASK_KEY, videoTaskStorageKey } from "@/app/video/video-task-storage";
import type { VideoPreview } from "@/components/video-preview-dialog";
import type { StoredAuthSession } from "@/store/auth";
import { createRequestId } from "@/lib/request-id";

const TERMINAL_STATUSES = new Set<CreationTask["status"]>(["success", "error", "cancelled"]);

function readTaskID(storageKey: string) {
  if (typeof window === "undefined" || !storageKey) return "";
  return window.localStorage.getItem(storageKey) || "";
}

function newTaskID() {
  return createRequestId("video");
}

export function useVideoCreation(session: StoredAuthSession | null | undefined) {
  const taskStorageKey = videoTaskStorageKey(session);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<VideoGenerationRequest["seconds"]>(6);
  const [size, setSize] = useState<VideoGenerationRequest["size"]>("720x1280");
  const [resolutionName, setResolutionName] = useState<VideoGenerationRequest["resolution_name"]>("720p");
  const [preset, setPreset] = useState<VideoGenerationRequest["preset"]>("custom");
  const [model, setModel] = useState<VideoGenerationRequest["model"]>("grok-imagine-video-1.5");
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
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState("");
  const [creditCostPerSecond, setCreditCostPerSecond] = useState(1);
  const [previewVideo, setPreviewVideo] = useState<(VideoPreview & { taskID: string }) | null>(null);
  const observedActiveTaskRef = useRef(false);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_VIDEO_TASK_KEY);
  }, []);

  useEffect(() => {
    setTaskScope({ storageKey: taskStorageKey, taskID: readTaskID(taskStorageKey) });
    setTask(null);
    setPollError("");
    observedActiveTaskRef.current = false;
  }, [taskStorageKey]);

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
          if (taskStorageKey) window.localStorage.removeItem(taskStorageKey);
          setPollError("");
          return;
        }
        if (current.status === "success" && taskStorageKey) {
          window.localStorage.removeItem(taskStorageKey);
        }
        if (current.status === "success" && !observedActiveTaskRef.current) {
          setTask(null);
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
          setPollError("");
          return;
        }
        if (!TERMINAL_STATUSES.has(current.status)) {
          observedActiveTaskRef.current = true;
        }
        setTask(current);
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
  }, [taskID, taskStorageKey]);

  const video = useMemo(
    () => task?.data?.find((item) => item.url && item.content_type?.startsWith("video/")),
    [task],
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
    setSelectedReferenceAssetIds(Array.from(new Set(ids)).filter((id) => available.has(id)).slice(0, 7));
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
      const created = await submitVideoGeneration({
        client_task_id: id,
        prompt: normalizedPrompt,
        model,
        seconds,
        size,
        resolution_name: resolutionName,
        preset,
        ...((uploadedReference?.input_reference || inputReference.trim())
          ? { image_reference: uploadedReference?.input_reference || inputReference.trim() }
          : {}),
        ...(selectedReferenceAssetIds.length ? { reference_images: selectedReferenceAssetIds.map((id) => `video-ref:${id}`) } : {}),
      });
      if (taskStorageKey) window.localStorage.setItem(taskStorageKey, id);
      observedActiveTaskRef.current = true;
      setTask(created);
      setTaskScope({ storageKey: taskStorageKey, taskID: id });
      toast.success("视频任务已提交");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交视频任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!taskID || !task || TERMINAL_STATUSES.has(task.status)) return;
    try {
      setTask(await cancelCreationTask(taskID));
      toast.success("视频任务已取消");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消视频任务失败");
    }
  }

  function watchVideo() {
    if (!task || !video?.url) return;
    setPreviewVideo({
      url: video.url,
      taskID: task.id,
      prompt: prompt.trim(),
      seconds: video.seconds || seconds,
      size,
      resolution: resolutionName,
    });
    if (taskStorageKey) window.localStorage.removeItem(taskStorageKey);
  }

  function closePreview() {
    setPreviewVideo(null);
  }

  return {
    prompt, setPrompt, seconds, setSeconds, size, setSize, resolutionName, setResolutionName,
    model, setModel,
    preset, setPreset, inputReference, setInputReferenceURL, uploadedReference,
    uploadingReference, uploadReference, clearUploadedReference,
    uploadingReferences, uploadReferences,
    referenceAssets, selectedReferenceAssetIds, referenceLibraryOpen, setReferenceLibraryOpen, referenceLibraryLoading,
    referenceAssetsHasMore, referenceAssetsLoadingMore, loadMoreReferenceAssets,
    openReferenceLibrary, toggleReferenceAsset, setSelectedReferenceAssets, removeReferenceAsset,
    task, video, submitting, pollError, submit, cancel, creditCostPerSecond,
    previewVideo, watchVideo, closePreview,
  };
}

export type VideoCreationController = ReturnType<typeof useVideoCreation>;
