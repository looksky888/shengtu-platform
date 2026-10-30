import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  EXPIRED_VIDEO_TASK_MESSAGE,
  isTerminalVideoStatus,
  LEGACY_VIDEO_TASK_KEY,
  markMissingVideoTakesError,
  MAX_RECENT_VIDEO_TAKES,
  normalizeVideoModel,
  normalizeVideoPreset,
  normalizeVideoResolution,
  normalizeVideoSeconds,
  normalizeVideoSize,
  ratioForVideoSize,
  readRecentVideoTakes,
  recentVideoTakesStorageKey,
  removeRecentVideoTake,
  upsertRecentVideoTake,
  videoTaskStorageKey,
  writeRecentVideoTakes,
  type RecentVideoTake,
  type SubmittedVideoMeta,
} from "@/app/video/video-task-storage";
import type { VideoInspirationCard } from "@/app/video/video-options";
import type { VideoPreview } from "@/components/video-preview-dialog";
import type { StoredAuthSession } from "@/store/auth";
import { createRequestId } from "@/lib/request-id";
import { dispatchQuotaRefresh } from "@/lib/quota-events";

export type VideoInputMode = "t2v" | "i2v" | "ref";
export type VideoStageViewMode = "stream" | "stage";

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

function sortRecentTakesNewestFirst(items: RecentVideoTake[]): RecentVideoTake[] {
  return [...items].sort((left, right) => {
    const leftActive = left.status === "queued" || left.status === "running" ? 1 : 0;
    const rightActive = right.status === "queued" || right.status === "running" ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    return rightTime - leftTime;
  });
}

export function useVideoCreation(session: StoredAuthSession | null | undefined) {
  const taskStorageKey = videoTaskStorageKey(session);
  const recentTakesKey = recentVideoTakesStorageKey(session);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState<VideoGenerationRequest["seconds"]>(6);
  const [size, setSize] = useState<VideoGenerationRequest["size"]>("1280x720");
  const [resolutionName, setResolutionName] = useState<VideoGenerationRequest["resolution_name"]>("720p");
  const [preset, setPreset] = useState<VideoGenerationRequest["preset"]>("custom");
  const [model, setModel] = useState<VideoGenerationRequest["model"]>("grok-imagine-video-1.5");
  const [inputMode, setInputMode] = useState<VideoInputMode>("t2v");
  const [viewMode, setViewMode] = useState<VideoStageViewMode>("stream");
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedTakeId, setSelectedTakeId] = useState("");
  const [lastSubmittedTaskId, setLastSubmittedTaskId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState("");
  const [creditCostPerSecond, setCreditCostPerSecond] = useState(1);
  const [previewVideo, setPreviewVideo] = useState<(VideoPreview & { taskID: string }) | null>(null);
  const [submittedMeta, setSubmittedMeta] = useState<SubmittedVideoMeta | null>(null);
  const submittedMetaRef = useRef<SubmittedVideoMeta | null>(null);
  const observedActiveTaskRef = useRef(false);

  const activeTakeIdsKey = useMemo(() => {
    const ids = new Set<string>();
    if (taskID) ids.add(taskID);
    for (const item of recentTakes) {
      if (!isTerminalVideoStatus(item.status)) {
        ids.add(item.taskId);
      }
    }
    return Array.from(ids).join(",");
  }, [recentTakes, taskID]);

  const focusComposer = useCallback((flash = false) => {
    window.requestAnimationFrame(() => {
      const node = composerTextareaRef.current;
      if (!node) return;
      node.focus();
      if (flash) {
        node.setAttribute("data-preset-flash", "1");
        window.setTimeout(() => {
          node.removeAttribute("data-preset-flash");
        }, 650);
      }
    });
  }, []);

  useEffect(() => {
    writeTaskID(LEGACY_VIDEO_TASK_KEY, "");
  }, []);

  useEffect(() => {
    setTaskScope({ storageKey: taskStorageKey, taskID: readTaskID(taskStorageKey) });
    setTask(null);
    setPollError("");
    submittedMetaRef.current = null;
    setSubmittedMeta(null);
    observedActiveTaskRef.current = false;
  }, [taskStorageKey]);

  useEffect(() => {
    const initialLocal = readRecentVideoTakes(recentTakesKey);
    setRecentTakes(initialLocal);
    setSelectedTakeId("");
    if (!recentTakesKey) return;

    const abortController = new AbortController();
    if (initialLocal.length === 0) {
      setIsLoadingHistory(true);
    }
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
            } else {
              merged.push(cloudTake);
            }
          }
          const trimmed = sortRecentTakesNewestFirst(merged).slice(0, MAX_RECENT_VIDEO_TAKES);
          writeRecentVideoTakes(recentTakesKey, trimmed);
          return trimmed;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [recentTakesKey]);

  useEffect(() => {
    let disposed = false;
    fetchCreationPricing()
      .then((data) => {
        if (!disposed) {
          setCreditCostPerSecond(Math.max(1, Number(data.video_credit_cost_per_second) || 1));
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTakeIdsKey) return;
    let disposed = false;
    let timer: number | undefined;

    const sync = async () => {
      const idsToPoll = activeTakeIdsKey.split(",").filter(Boolean);
      if (idsToPoll.length === 0) return;
      try {
        const result = await fetchCreationTasks(idsToPoll);
        if (disposed) return;

        const returnedMap = new Map((result.items || []).map((item) => [item.id, item]));
        const missingIds = Array.from(
          new Set([
            ...(Array.isArray(result.missing_ids) ? result.missing_ids : []),
            ...idsToPoll.filter((id) => !returnedMap.has(id)),
          ]),
        );

        const current = taskID ? returnedMap.get(taskID) : undefined;
        const currentVideo = current?.data?.find(
          (item) => item.url && item.content_type?.startsWith("video/"),
        );

        if (current && isTerminalVideoStatus(current.status) && taskStorageKey) {
          writeTaskID(taskStorageKey, "");
        }

        if (current && !isTerminalVideoStatus(current.status)) {
          observedActiveTaskRef.current = true;
        }

        setRecentTakes((prev) => {
          let next = prev;
          let changed = false;

          if (missingIds.length > 0) {
            const missingResult = markMissingVideoTakesError(next, missingIds);
            if (missingResult.changed) {
              next = missingResult.takes;
              changed = true;
            }
          }

          for (const remote of result.items || []) {
            if (remote.id === taskID) continue;
            const existing = next.find((item) => item.taskId === remote.id);
            if (!existing) continue;
            const remoteVideo = remote.data?.find(
              (item) => item.url && item.content_type?.startsWith("video/"),
            );
            const nextVideoUrl = remoteVideo?.url || existing.videoUrl;
            const nextError =
              remote.status === "error"
                ? remote.error || existing.error
                : undefined;
            if (
              existing.status === remote.status &&
              existing.videoUrl === nextVideoUrl &&
              existing.error === nextError
            ) {
              continue;
            }
            next = upsertRecentVideoTake(next, {
              ...existing,
              status: remote.status,
              videoUrl: nextVideoUrl,
              error: nextError,
            });
            changed = true;
          }

          if (current) {
            const existing = next.find((item) => item.taskId === current.id);
            const meta =
              submittedMetaRef.current?.taskId === current.id
                ? submittedMetaRef.current
                : null;
            if (existing || meta) {
              const resolvedSize = existing?.size || meta?.size || "1280x720";
              const nextError =
                current.status === "error"
                  ? current.error || existing?.error
                  : undefined;
              next = upsertRecentVideoTake(next, {
                taskId: current.id,
                prompt: existing?.prompt || meta?.prompt || "",
                ratio: existing?.ratio || meta?.ratio || ratioForVideoSize(resolvedSize),
                size: resolvedSize,
                seconds: existing?.seconds || meta?.seconds || 6,
                resolutionName: existing?.resolutionName || meta?.resolutionName || "720p",
                preset: existing?.preset || meta?.preset || "custom",
                model: existing?.model || meta?.model || "grok-imagine-video-1.5",
                status: current.status,
                videoUrl: currentVideo?.url || existing?.videoUrl,
                error: nextError,
                createdAt: existing?.createdAt || meta?.createdAt || new Date().toISOString(),
              });
              changed = true;
            }
          }

          if (changed) {
            writeRecentVideoTakes(recentTakesKey, next);
          }
          return next;
        });

        if (taskID && !current) {
          setTask(null);
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
          writeTaskID(taskStorageKey, "");
          setPollError("");
        } else if (current) {
          if (isTerminalVideoStatus(current.status) && !observedActiveTaskRef.current) {
            setTask(null);
            setTaskScope({ storageKey: taskStorageKey, taskID: "" });
            writeTaskID(taskStorageKey, "");
            setPollError("");
          } else {
            setTask(current);
            if (current.status === "success") {
              setSelectedTakeId(current.id);
            }
            setPollError("");
            if (isTerminalVideoStatus(current.status) && observedActiveTaskRef.current) {
              dispatchQuotaRefresh();
            }
          }
        }

        const hasRemainingActive = (result.items || []).some(
          (item) => !isTerminalVideoStatus(item.status),
        );
        if (hasRemainingActive) {
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
  }, [activeTakeIdsKey, recentTakesKey, taskID, taskStorageKey]);

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

  async function uploadReference(file: File, options?: { switchToI2V?: boolean }) {
    if (options?.switchToI2V) {
      setInputMode("i2v");
    }
    setUploadingReference(true);
    try {
      const uploaded = await uploadVideoInput(file);
      setInputReference("");
      setUploadedReference({ ...uploaded, preview_url: URL.createObjectURL(file) });
      toast.success(options?.switchToI2V ? "已上传首帧图并切换至图生视频" : "首帧图片已上传");
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
      setReferenceAssets((current) => [
        ...current,
        ...(data.items || []).filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setReferenceAssetsCursor(data.next_cursor || "");
      setReferenceAssetsHasMore(Boolean(data.has_more));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多参考图失败");
    } finally {
      setReferenceAssetsLoadingMore(false);
    }
  }

  function toggleReferenceAsset(id: string) {
    setSelectedReferenceAssetIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 7
          ? current
          : [...current, id],
    );
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
      focusComposer();
      return;
    }
    setSubmitting(true);
    setPollError("");
    try {
      const id = newTaskID();
      const submittedCreatedAt = new Date().toISOString();
      const submittedSize = size;
      const submittedSeconds = seconds;
      const submittedResolutionName = resolutionName;
      const submittedPreset = preset;
      const submittedModel = model;
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
        model: submittedModel,
        seconds: submittedSeconds,
        size: submittedSize,
        resolution_name: submittedResolutionName,
        preset: submittedPreset,
        ...modeScopedReferences,
      });
      const taskKeyId = created.id || id;
      const nextMeta: SubmittedVideoMeta = {
        taskId: taskKeyId,
        prompt: normalizedPrompt,
        ratio: ratioForVideoSize(submittedSize),
        size: submittedSize,
        seconds: submittedSeconds,
        resolutionName: submittedResolutionName,
        preset: submittedPreset,
        model: submittedModel,
        createdAt: submittedCreatedAt,
      };
      submittedMetaRef.current = nextMeta;
      setSubmittedMeta(nextMeta);
      if (isTerminalVideoStatus(created.status)) {
        writeTaskID(taskStorageKey, "");
        setTaskScope({ storageKey: taskStorageKey, taskID: "" });
      } else {
        writeTaskID(taskStorageKey, taskKeyId);
        observedActiveTaskRef.current = true;
        setTaskScope({ storageKey: taskStorageKey, taskID: taskKeyId });
      }
      setTask(created);
      setSelectedTakeId(taskKeyId);
      setLastSubmittedTaskId(taskKeyId);
      setRecentTakes((prev) => {
        const next = upsertRecentVideoTake(
          prev,
          {
            ...nextMeta,
            status: created.status,
          },
          { moveToFront: true },
        );
        writeRecentVideoTakes(recentTakesKey, next);
        return next;
      });
      toast.success("视频任务已提交");
      dispatchQuotaRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交视频任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(targetTaskId?: string) {
    const resolvedId = String(targetTaskId || task?.id || taskID || "").trim();
    if (!resolvedId) return;
    const isCurrentTaskActive = Boolean(
      task && task.id === resolvedId && !isTerminalVideoStatus(task.status),
    );
    const matchingTake = recentTakes.find((item) => item.taskId === resolvedId);
    const isTakeActive = Boolean(matchingTake && !isTerminalVideoStatus(matchingTake.status));
    if (!isCurrentTaskActive && !isTakeActive) return;

    try {
      const cancelled = await cancelCreationTask(resolvedId);
      if (task?.id === resolvedId || taskID === resolvedId) {
        setTask(cancelled);
        if (isTerminalVideoStatus(cancelled.status)) {
          writeTaskID(taskStorageKey, "");
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
        }
      }
      setRecentTakes((prev) => {
        const existing = prev.find((item) => item.taskId === (cancelled.id || resolvedId));
        if (!existing) return prev;
        const next = upsertRecentVideoTake(prev, {
          ...existing,
          status: cancelled.status,
        });
        writeRecentVideoTakes(recentTakesKey, next);
        return next;
      });
      toast.success("视频任务已取消");
      dispatchQuotaRefresh();
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      const message = error instanceof Error ? error.message : "取消视频任务失败";
      if (status === 404 || /not\s*found|不存在|已过期/i.test(message)) {
        if (task?.id === resolvedId || taskID === resolvedId) {
          setTask(null);
          setTaskScope({ storageKey: taskStorageKey, taskID: "" });
          writeTaskID(taskStorageKey, "");
        }
        setRecentTakes((prev) => {
          const result = markMissingVideoTakesError(prev, [resolvedId], EXPIRED_VIDEO_TASK_MESSAGE);
          if (result.changed) {
            writeRecentVideoTakes(recentTakesKey, result.takes);
          }
          return result.takes;
        });
        toast.info("该任务已过期，已从运行状态清理");
        return;
      }
      toast.error(message);
    }
  }

  function selectRecentTake(takeTaskId: string) {
    setSelectedTakeId((current) => (current === takeTaskId && takeTaskId !== task?.id ? "" : takeTaskId));
  }

  function clearSelectedTake() {
    setSelectedTakeId("");
  }

  function startNewShot() {
    setSelectedTakeId("");
    setPrompt("");
    focusComposer(true);
  }

  function removeTake(takeTaskId: string) {
    const normalizedId = String(takeTaskId || "").trim();
    if (!normalizedId) return;
    let fallbackTakeId = "";
    setRecentTakes((prev) => {
      const next = removeRecentVideoTake(prev, normalizedId);
      fallbackTakeId = next[0]?.taskId || "";
      writeRecentVideoTakes(recentTakesKey, next);
      return next;
    });
    if (
      task?.id === normalizedId ||
      taskID === normalizedId ||
      readTaskID(taskStorageKey) === normalizedId
    ) {
      setTask(null);
      setTaskScope({ storageKey: taskStorageKey, taskID: "" });
      writeTaskID(taskStorageKey, "");
      setPollError("");
    }
    if (submittedMetaRef.current?.taskId === normalizedId) {
      submittedMetaRef.current = null;
      setSubmittedMeta(null);
    }
    setLastSubmittedTaskId((current) => (current === normalizedId ? "" : current));
    setPreviewVideo((current) => (current?.taskID === normalizedId ? null : current));
    setSelectedTakeId((current) => (current === normalizedId ? fallbackTakeId : current));
  }

  function clearHistoryTakes() {
    const isActive = Boolean(task && !isTerminalVideoStatus(task.status));
    setRecentTakes((prev) => {
      const activeOnly = prev.filter((item) => !isTerminalVideoStatus(item.status));
      writeRecentVideoTakes(recentTakesKey, activeOnly);
      return activeOnly;
    });
    if (!isActive) {
      setTask(null);
      setPreviewVideo(null);
      setSelectedTakeId("");
      setTaskScope({ storageKey: taskStorageKey, taskID: "" });
      writeTaskID(taskStorageKey, "");
      submittedMetaRef.current = null;
      setSubmittedMeta(null);
      setLastSubmittedTaskId("");
      setPollError("");
    } else if (task) {
      setPreviewVideo(null);
      setSelectedTakeId(task.id);
    }
    toast.success("已清空本地历史镜头列表（云端视频库归档不受影响）");
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
    focusComposer(true);
  }

  function applyInspirationCard(card: VideoInspirationCard) {
    setPrompt(card.prompt);
    setSize(card.size);
    setSeconds(card.seconds);
    focusComposer(true);
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
    focusComposer(true);
  }

  function watchTakeVideo(take?: RecentVideoTake | null) {
    if (take?.videoUrl) {
      setPreviewVideo({
        url: take.videoUrl,
        taskID: take.taskId,
        prompt: take.prompt,
        seconds: take.seconds,
        size: take.size,
        resolution: take.resolutionName,
      });
      return;
    }
    if (selectedTake && selectedTake.videoUrl) {
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

  function watchVideo() {
    watchTakeVideo(selectedTake);
  }

  function closePreview() {
    setPreviewVideo(null);
  }

  return {
    composerTextareaRef,
    focusComposer,
    prompt, setPrompt, seconds, setSeconds, size, setSize, resolutionName, setResolutionName,
    model, setModel,
    inputMode, setInputMode,
    viewMode, setViewMode,
    preset, setPreset, inputReference, setInputReferenceURL, uploadedReference,
    uploadingReference, uploadReference, clearUploadedReference,
    uploadingReferences, uploadReferences,
    referenceAssets, selectedReferenceAssetIds, referenceLibraryOpen, setReferenceLibraryOpen, referenceLibraryLoading,
    referenceAssetsHasMore, referenceAssetsLoadingMore, loadMoreReferenceAssets,
    openReferenceLibrary, toggleReferenceAsset, setSelectedReferenceAssets, removeReferenceAsset,
    task, video, submittedMeta, submitting, pollError, submit, cancel, creditCostPerSecond,
    recentTakes, isLoadingHistory, selectedTakeId, selectedTake, lastSubmittedTaskId,
    selectRecentTake, clearSelectedTake, startNewShot, removeTake, clearHistoryTakes,
    applyRecentTakePrompt, applyInspirationCard, appendCameraStyleChip,
    previewVideo, watchVideo, watchTakeVideo, closePreview,
  };
}

export type VideoCreationController = ReturnType<typeof useVideoCreation>;
