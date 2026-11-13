"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { parseAssetTimestamp } from "@/app/assets/assets-cloud-policy";
import { preloadRoute } from "@/app/route-prefetch";
import {
  readRecentVideoTakes,
  recentVideoTakesStorageKey,
} from "@/app/video/video-task-storage";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { useImageConversationsForQueue } from "@/components/image-task-queue-utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SubNav } from "@/components/ui/sub-nav";
import {
  VideoPreviewDialog,
  type VideoPreview,
} from "@/components/video-preview-dialog";
import { cancelCreationTask, fetchCreationTasks } from "@/lib/api";
import type { CreationTask, CreationTaskListResponse } from "@/lib/api-types";
import { copyText } from "@/lib/clipboard";
import { httpRequest } from "@/lib/request";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";
import { fetchVideoAssets, type VideoAsset } from "@/lib/video-task-api";
import { canAccessPath, hasAPIPermission } from "@/store/auth";

import {
  isTaskActive,
  isTaskFailedOrCancelled,
  isTaskSucceeded,
  parseStatusTab,
  STATUS_TABS,
  type TaskKindFilter,
  type TaskStatusTab,
  type TaskViewMode,
} from "./task-helpers";
import { TaskItemCard } from "./task-item-card";

export default function TasksPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/tasks");
  const [searchParams, setSearchParams] = useSearchParams();
  const pageVisible = usePageVisible();
  const conversations = useImageConversationsForQueue();

  const statusTab = parseStatusTab(searchParams.get("status"));
  const [kindFilter, setKindFilter] = useState<TaskKindFilter>("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");

  const [tasks, setTasks] = useState<CreationTask[]>([]);
  const [archivedVideos, setArchivedVideos] = useState<VideoAsset[]>([]);
  const [hydratedById, setHydratedById] = useState<Record<string, CreationTask>>(
    {},
  );
  const hydratedIdsRef = useRef<Set<string>>(new Set());
  const loadInFlightRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingIds, setCancellingIds] = useState<Record<string, boolean>>({});

  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{
    preview: VideoPreview;
    downloadName: string;
  } | null>(null);

  const localTaskMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { prompt?: string; mediaUrl?: string }
    >();
    for (const vid of archivedVideos) {
      const contentUrl =
        vid.url || `/api/videos/${encodeURIComponent(vid.id)}/content`;
      if (vid.task_id) {
        map.set(vid.task_id, {
          prompt: vid.prompt,
          mediaUrl: contentUrl,
        });
      }
      map.set(vid.id, {
        prompt: vid.prompt,
        mediaUrl: contentUrl,
      });
    }
    for (const conv of conversations) {
      for (const turn of conv.turns) {
        for (const img of turn.images || []) {
          if (!img.taskId) continue;
          const mediaUrl =
            img.url ||
            (img.b64_json
              ? `data:image/png;base64,${img.b64_json}`
              : undefined);
          map.set(img.taskId, {
            prompt: turn.prompt,
            mediaUrl,
          });
        }
      }
    }
    const videoKey = recentVideoTakesStorageKey(session ?? null);
    if (videoKey) {
      for (const take of readRecentVideoTakes(videoKey)) {
        if (take.taskId) {
          map.set(take.taskId, {
            prompt: take.prompt,
            mediaUrl: take.videoUrl,
          });
        }
      }
    }
    return map;
  }, [archivedVideos, conversations, session]);

  const canReadCreationTasks = Boolean(
    session && hasAPIPermission(session, "GET", "/api/creation-tasks"),
  );
  const canCancelCreationTasks = Boolean(
    session && hasAPIPermission(session, "POST", "/api/creation-tasks"),
  );
  const canReadVideos = Boolean(
    session && hasAPIPermission(session, "GET", "/api/videos"),
  );
  const canAccessImage = Boolean(session && canAccessPath(session, "/image"));
  const canAccessVideo = Boolean(session && canAccessPath(session, "/video"));
  const createHref = canAccessImage
    ? "/image"
    : canAccessVideo
      ? "/video"
      : null;

  const loadTasks = useCallback(
    async (silent = false) => {
      if (silent && loadInFlightRef.current) return;
      if (!canReadCreationTasks && !canReadVideos) {
        setTasks([]);
        setArchivedVideos([]);
        if (!silent) setLoading(false);
        return;
      }

      loadControllerRef.current?.abort();
      const controller = new AbortController();
      loadControllerRef.current = controller;
      loadInFlightRef.current = true;

      if (!silent) setLoading(true);
      try {
        const [tasksSettled, videosSettled] = await Promise.allSettled([
          canReadCreationTasks
            ? httpRequest<CreationTaskListResponse>(
                "/api/creation-tasks?limit=100",
                {
                  headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
                  signal: controller.signal,
                },
              )
            : Promise.resolve({ items: [] as CreationTask[] }),
          canReadVideos
            ? fetchVideoAssets("mine", { limit: 100, signal: controller.signal })
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;

        if (!canReadCreationTasks) {
          setTasks([]);
        } else if (tasksSettled.status === "fulfilled") {
          const list = Array.isArray(tasksSettled.value.items)
            ? tasksSettled.value.items
            : [];
          setTasks(list);

          const needHydration = list
            .filter(
              (item) =>
                isTaskSucceeded(item.status) &&
                !item.data?.length &&
                !hydratedIdsRef.current.has(item.id),
            )
            .slice(0, 40)
            .map((item) => item.id);

          if (needHydration.length > 0) {
            for (const id of needHydration) {
              hydratedIdsRef.current.add(id);
            }
            void fetchCreationTasks(needHydration)
              .then((detail) => {
                if (!Array.isArray(detail.items) || detail.items.length === 0) {
                  for (const id of needHydration) {
                    hydratedIdsRef.current.delete(id);
                  }
                  return;
                }
                const returnedSet = new Set(detail.items.map((item) => item.id));
                for (const id of needHydration) {
                  if (!returnedSet.has(id)) {
                    hydratedIdsRef.current.delete(id);
                  }
                }
                setHydratedById((prev) => {
                  const next = { ...prev };
                  for (const full of detail.items) {
                    next[full.id] = full;
                  }
                  return next;
                });
              })
              .catch(() => {
                for (const id of needHydration) {
                  hydratedIdsRef.current.delete(id);
                }
              });
          }
        } else if (!silent) {
          toast.error(
            tasksSettled.reason instanceof Error
              ? tasksSettled.reason.message
              : "加载任务列表失败",
          );
        }

        if (!canReadVideos) {
          setArchivedVideos([]);
        } else if (
          videosSettled.status === "fulfilled" &&
          videosSettled.value &&
          Array.isArray(videosSettled.value.items)
        ) {
          setArchivedVideos(videosSettled.value.items);
        }
      } finally {
        loadInFlightRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [canReadCreationTasks, canReadVideos],
  );

  useEffect(() => {
    return () => {
      loadControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadTasks(false);
  }, [loadTasks, session]);

  const hasActiveTasks = useMemo(
    () => tasks.some((item) => isTaskActive(item.status)),
    [tasks],
  );

  // Live poll every 4s while queued/running tasks exist and page is visible
  useEffect(() => {
    if (!session || !canReadCreationTasks || !hasActiveTasks || !pageVisible)
      return;
    const timer = window.setInterval(() => {
      void loadTasks(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [canReadCreationTasks, hasActiveTasks, loadTasks, pageVisible, session]);

  const mergedTasks = useMemo(() => {
    const baseList = tasks.map((task) => {
      const hydrated = hydratedById[task.id];
      return hydrated ? { ...task, data: hydrated.data ?? task.data } : task;
    });

    const seenTaskIds = new Set<string>();
    const seenVideoIds = new Set<string>();
    for (const task of baseList) {
      seenTaskIds.add(task.id);
      for (const output of task.data || []) {
        if (output.video_id) {
          seenVideoIds.add(output.video_id);
        }
      }
    }

    const syntheticVideoTasks: CreationTask[] = [];
    for (const vid of archivedVideos) {
      const taskId = (vid.task_id || vid.id).trim();
      if (!taskId) continue;
      if (
        seenTaskIds.has(taskId) ||
        seenTaskIds.has(vid.id) ||
        seenVideoIds.has(vid.id)
      ) {
        continue;
      }
      seenTaskIds.add(taskId);
      seenVideoIds.add(vid.id);

      const contentUrl =
        vid.url || `/api/videos/${encodeURIComponent(vid.id)}/content`;
      const resolvedModel = (vid.model ||
        "grok-imagine-video-1.5") as CreationTask["model"];

      syntheticVideoTasks.push({
        id: taskId,
        status: "success",
        mode: "video",
        output_type: "video",
        model: resolvedModel,
        effective_model: vid.model || "grok-imagine-video-1.5",
        size: vid.size || undefined,
        visibility: vid.visibility,
        owner_id: vid.owner_id,
        owner_name: vid.owner_name,
        created_at: vid.created_at,
        updated_at: vid.created_at,
        data: [
          {
            url: contentUrl,
            video_id: vid.id,
            seconds: vid.seconds,
            resolution: vid.resolution_name,
            content_type: vid.content_type || "video/mp4",
            revised_prompt: vid.prompt || undefined,
          },
        ],
      });
    }

    if (syntheticVideoTasks.length === 0) {
      return baseList;
    }

    const combined = [...baseList, ...syntheticVideoTasks];
    combined.sort((a, b) => {
      const aActive = isTaskActive(a.status) ? 1 : 0;
      const bActive = isTaskActive(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (
        parseAssetTimestamp(b.created_at) - parseAssetTimestamp(a.created_at)
      );
    });
    return combined;
  }, [archivedVideos, hydratedById, tasks]);

  const summary = useMemo(() => {
    let active = 0;
    let succeeded = 0;
    let failed = 0;
    for (const task of mergedTasks) {
      if (isTaskActive(task.status)) active += 1;
      else if (isTaskSucceeded(task.status)) succeeded += 1;
      else if (isTaskFailedOrCancelled(task.status)) failed += 1;
    }
    return {
      total: mergedTasks.length,
      active,
      succeeded,
      failed,
    };
  }, [mergedTasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    return mergedTasks.filter((task) => {
      if (statusTab === "active" && !isTaskActive(task.status)) return false;
      if (statusTab === "succeeded" && !isTaskSucceeded(task.status)) return false;
      if (statusTab === "failed" && !isTaskFailedOrCancelled(task.status))
        return false;

      if (kindFilter === "video" && task.mode !== "video") return false;
      if (kindFilter === "image" && task.mode === "video") return false;

      if (q) {
        const localMeta = localTaskMetaMap.get(task.id);
        const revisedPrompt = task.data?.[0]?.revised_prompt || "";
        const haystack = [
          task.id,
          task.model,
          task.effective_model,
          localMeta?.prompt,
          revisedPrompt,
          task.error,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [kindFilter, localTaskMetaMap, mergedTasks, searchQuery, statusTab]);

  const handleStatusTabChange = (next: TaskStatusTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") {
      nextParams.delete("status");
    } else {
      nextParams.set("status", next);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleCancel = async (taskId: string) => {
    if (!canCancelCreationTasks) return;
    setCancellingIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      const updated = await cancelCreationTask(taskId);
      setTasks((prev) =>
        prev.map((item) => (item.id === taskId ? { ...item, ...updated } : item)),
      );
      toast.success("已取消该生成任务");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消任务失败");
    } finally {
      setCancellingIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const handleCopyPrompt = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    try {
      await copyText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] min-w-0 flex-col gap-4">
      {/* Header + 4 Summary Pills + Actions */}
      <div className="flex flex-col gap-3 border-b border-border/65 pb-0">
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              任务中心
            </h1>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted-foreground dark:bg-[#17181c]">
                <span>总任务</span>
                <strong className="font-mono text-foreground tabular-nums">
                  {summary.total}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted-foreground dark:bg-[#17181c]">
                <span className="size-1.5 rounded-full bg-sky-400" />
                <span>进行中/排队</span>
                <strong className="font-mono text-foreground tabular-nums">
                  {summary.active}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted-foreground dark:bg-[#17181c]">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span>已完成</span>
                <strong className="font-mono text-foreground tabular-nums">
                  {summary.succeeded}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted-foreground dark:bg-[#17181c]">
                <span className="size-1.5 rounded-full bg-rose-400" />
                <span>失败/已取消</span>
                <strong className="font-mono text-foreground tabular-nums">
                  {summary.failed}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadTasks(false)}
              className="h-8 bg-surface dark:bg-[#17181c]"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              <span>刷新</span>
            </Button>

            {createHref ? (
              <Button asChild size="sm" className="h-8 rounded-lg font-semibold">
                <Link
                  to={createHref}
                  onMouseEnter={() => preloadRoute(createHref)}
                >
                  <Plus className="size-3.5" />
                  <span>新建创作</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <SubNav
          items={STATUS_TABS}
          value={statusTab}
          onValueChange={handleStatusTabChange}
          variant="underline"
          layoutId="tasks-status-tabs"
          className="border-b-0"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索提示词、模型名称或任务 ID…"
              className="h-8 rounded-lg border-border/70 bg-surface pr-7 pl-8 text-xs dark:bg-[#17181c]"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="清空搜索"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-surface p-0.5 text-xs dark:bg-[#17181c]">
            {(
              [
                { value: "all" as const, label: "全部" },
                { value: "image" as const, label: "图片" },
                { value: "video" as const, label: "视频" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKindFilter(opt.value)}
                className={cn(
                  "h-7 rounded-md px-2.5 font-medium transition-colors",
                  kindFilter === opt.value
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-surface p-0.5 dark:bg-[#17181c]">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-label="列表视图"
            title="列表视图"
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md transition-colors",
              viewMode === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutList className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label="网格视图"
            title="网格视图"
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md transition-colors",
              viewMode === "grid"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Task List / Grid */}
      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center gap-2 rounded-xl bg-surface p-8 text-xs text-muted-foreground dark:bg-[#17181c]">
          <LoaderCircle className="size-4 animate-spin" />
          <span>正在加载创作任务队列…</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={searchQuery ? "未匹配到符合条件的任务" : "当前分类下暂无任务记录"}
          description="你在创作工作台或通过 API 发起的生图、修图与视频渲染任务将实时在此追踪。"
          action={
            createHref ? (
              <Button asChild size="sm">
                <Link
                  to={createHref}
                  onMouseEnter={() => preloadRoute(createHref)}
                >
                  <Plus className="size-3.5" />
                  <span>新建创作任务</span>
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          className={cn(
            viewMode === "grid"
              ? "grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3"
              : "flex flex-col gap-2.5",
          )}
        >
          {filteredTasks.map((task) => (
            <TaskItemCard
              key={task.id}
              task={task}
              localMeta={localTaskMetaMap.get(task.id)}
              canCancel={canCancelCreationTasks}
              cancelling={Boolean(cancellingIds[task.id])}
              onCancel={(taskId) => void handleCancel(taskId)}
              onCopyPrompt={(prompt) => void handleCopyPrompt(prompt)}
              onPreviewVideo={setPreviewVideo}
              onPreviewImage={setLightboxImage}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        images={lightboxImage ? [lightboxImage] : []}
        currentIndex={0}
        open={Boolean(lightboxImage)}
        onOpenChange={(open) => {
          if (!open) setLightboxImage(null);
        }}
        onIndexChange={() => undefined}
      />

      <VideoPreviewDialog
        variant="studio"
        video={previewVideo?.preview ?? null}
        downloadName={previewVideo?.downloadName}
        onOpenChange={(open) => {
          if (!open) setPreviewVideo(null);
        }}
      />
    </div>
  );
}
