"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Film,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  VIDEO_RECENT_TAKES_UPDATED_EVENT,
  isTerminalVideoStatus,
  markMissingVideoTakesError,
  readRecentVideoTakes,
  recentVideoTakesStorageKey,
  upsertRecentVideoTake,
  videoTaskStorageKey,
  writeRecentVideoTakes,
  type RecentVideoTake,
} from "@/app/video/video-task-storage";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchCreationTasks } from "@/lib/api";
import { isTurnBusy } from "@/lib/image-turn-state";
import { AUTH_SESSION_CHANGE_EVENT, getCachedAuthSession } from "@/lib/session";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";
import { canAccessPath } from "@/store/auth";
import {
  activeImageConversationStorageKey,
  IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT,
} from "@/store/image-conversations";
import {
  getImageTurnProgressSnapshot,
  subscribeImageTurnProgress,
} from "@/store/image-turn-progress";

import { CompletionItem, QueueItem } from "./image-task-queue-items";
import {
  findQueueItem,
  formatQueueTime,
  getTaskQueueItems,
  isTerminalTurnStatus,
  useImageConversationsForQueue,
  type RecentQueueCompletion,
  type TaskQueueItem,
} from "./image-task-queue-utils";

type RecentVideoCompletion = {
  take: RecentVideoTake;
  completedAt: number;
};

function useActiveVideoTakes(open: boolean): RecentVideoTake[] {
  const [takes, setTakes] = useState<RecentVideoTake[]>([]);

  useEffect(() => {
    const sync = () => {
      const session = getCachedAuthSession();
      const key = recentVideoTakesStorageKey(session);
      if (!key) {
        setTakes([]);
        return;
      }
      const active = readRecentVideoTakes(key).filter(
        (item) => item.status === "queued" || item.status === "running",
      );
      setTakes(active);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(VIDEO_RECENT_TAKES_UPDATED_EVENT, sync);
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
    const timer = open ? window.setInterval(sync, 2500) : null;
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(VIDEO_RECENT_TAKES_UPDATED_EVENT, sync);
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [open]);

  return takes;
}

export function ImageTaskQueue({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useImageConversationsForQueue();
  const progressByTurnKey = useSyncExternalStore(
    subscribeImageTurnProgress,
    getImageTurnProgressSnapshot,
    getImageTurnProgressSnapshot,
  );
  const queueItems = useMemo(
    () => getTaskQueueItems(conversations),
    [conversations],
  );
  const [recentCompletions, setRecentCompletions] = useState<
    RecentQueueCompletion[]
  >([]);
  const [recentVideoCompletions, setRecentVideoCompletions] = useState<
    RecentVideoCompletion[]
  >([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const activeVideoTakes = useActiveVideoTakes(open);
  const pageVisible = usePageVisible();
  const previousQueueItemsRef = useRef<Map<string, TaskQueueItem>>(new Map());
  const activeCount = queueItems.length + activeVideoTakes.length;
  const hasRecentCompletion =
    recentCompletions.length > 0 || recentVideoCompletions.length > 0;
  const session = getCachedAuthSession();
  const canOpenTaskCenter = Boolean(
    session && canAccessPath(session, "/task-queue"),
  );
  const isOnVideoPage = location.pathname.startsWith("/video") && !location.pathname.startsWith("/video-library");
  const activeVideoTaskIdsKey = activeVideoTakes.map((item) => item.taskId).join(",");

  useEffect(() => {
    const handleSessionChange = () => {
      previousQueueItemsRef.current = new Map();
      setRecentCompletions([]);
      setRecentVideoCompletions([]);
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () => window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
  }, []);

  // Background polling for active video tasks when the user switches away from /video.
  useEffect(() => {
    if (isOnVideoPage || !pageVisible || !activeVideoTaskIdsKey) return;
    let disposed = false;
    let timer: number | undefined;

    const pollVideoTasks = async () => {
      const currentSession = getCachedAuthSession();
      const recentKey = recentVideoTakesStorageKey(currentSession);
      const lastTaskKey = videoTaskStorageKey(currentSession);
      const ids = activeVideoTaskIdsKey.split(",").filter(Boolean);
      if (!recentKey || ids.length === 0) return;
      try {
        const result = await fetchCreationTasks(ids);
        if (disposed) return;
        const storedTakes = readRecentVideoTakes(recentKey);
        let updatedTakes = storedTakes;
        let changed = false;
        const newlyCompleted: RecentVideoCompletion[] = [];

        const clearStoredLastTaskId = (targetId: string) => {
          if (!lastTaskKey || !targetId) return;
          try {
            if (window.localStorage.getItem(lastTaskKey) === targetId) {
              window.localStorage.removeItem(lastTaskKey);
            }
          } catch {
            // Ignore storage access errors.
          }
        };

        for (const remote of result.items || []) {
          const existing = updatedTakes.find((item) => item.taskId === remote.id);
          if (!existing) continue;
          const videoAsset = remote.data?.find(
            (item) => item.url && item.content_type?.startsWith("video/"),
          );
          const nextVideoUrl = videoAsset?.url || existing.videoUrl;
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
          changed = true;
          const merged: RecentVideoTake = {
            ...existing,
            status: remote.status,
            videoUrl: nextVideoUrl,
            error: nextError,
          };
          updatedTakes = upsertRecentVideoTake(updatedTakes, merged);
          if (
            (existing.status === "queued" || existing.status === "running") &&
            isTerminalVideoStatus(remote.status)
          ) {
            newlyCompleted.push({ take: merged, completedAt: Date.now() });
            clearStoredLastTaskId(remote.id);
            if (remote.status === "success") {
              toast.success("视频渲染已完成，点击顶栏队列可立即查看");
            }
          }
        }

        const returnedIds = new Set((result.items || []).map((item) => item.id));
        const missingIds = Array.from(
          new Set([
            ...(Array.isArray(result.missing_ids) ? result.missing_ids : []),
            ...ids.filter((id) => !returnedIds.has(id)),
          ]),
        );
        if (missingIds.length > 0) {
          for (const missingId of missingIds) {
            clearStoredLastTaskId(missingId);
          }
          const missingResult = markMissingVideoTakesError(updatedTakes, missingIds);
          if (missingResult.changed) {
            for (const item of missingResult.takes) {
              const previous = updatedTakes.find((prev) => prev.taskId === item.taskId);
              if (
                previous &&
                !isTerminalVideoStatus(previous.status) &&
                item.status === "error"
              ) {
                newlyCompleted.push({ take: item, completedAt: Date.now() });
              }
            }
            updatedTakes = missingResult.takes;
            changed = true;
          }
        }

        if (changed) {
          writeRecentVideoTakes(recentKey, updatedTakes);
        }
        if (newlyCompleted.length > 0) {
          setRecentVideoCompletions((current) =>
            [...newlyCompleted, ...current].slice(0, 3),
          );
        }
        const stillHasActive = updatedTakes.some(
          (item) => !isTerminalVideoStatus(item.status),
        );
        if (!disposed && stillHasActive) {
          timer = window.setTimeout(pollVideoTasks, 3000);
        }
      } catch {
        // Ignore transient network errors during background queue polling.
        if (!disposed) {
          timer = window.setTimeout(pollVideoTasks, 3000);
        }
      }
    };

    timer = window.setTimeout(pollVideoTasks, 2500);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeVideoTaskIdsKey, isOnVideoPage, pageVisible]);

  useEffect(() => {
    const currentItems = new Map(
      queueItems.map((item) => [`${item.conversationId}:${item.turn.id}`, item]),
    );
    const completedItems: RecentQueueCompletion[] = [];
    previousQueueItemsRef.current.forEach((previousItem, key) => {
      if (currentItems.has(key)) return;
      const completedItem = findQueueItem(
        conversations,
        previousItem.conversationId,
        previousItem.turn.id,
      );
      if (
        !completedItem ||
        isTurnBusy(completedItem.turn) ||
        !isTerminalTurnStatus(completedItem.turn.status)
      )
        return;
      completedItems.push({
        ...completedItem,
        key,
        completedAt: Date.now(),
        finalStatus: completedItem.turn.status,
      });
    });
    previousQueueItemsRef.current = currentItems;
    if (completedItems.length > 0)
      setRecentCompletions((current) =>
        [...completedItems, ...current].slice(0, 4),
      );
  }, [conversations, queueItems]);

  useEffect(() => {
    if (recentCompletions.length === 0 && recentVideoCompletions.length === 0) return;
    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 8000;
      setRecentCompletions((current) =>
        current.filter((item) => item.completedAt >= cutoff),
      );
      setRecentVideoCompletions((current) =>
        current.filter((item) => item.completedAt >= cutoff),
      );
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [recentCompletions, recentVideoCompletions]);

  useEffect(() => {
    if (
      !pageVisible ||
      (!open &&
        activeCount === 0 &&
        Object.keys(progressByTurnKey).length === 0 &&
        !hasRecentCompletion)
    )
      return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeCount, hasRecentCompletion, open, pageVisible, progressByTurnKey]);

  const openConversation = (conversationId: string) => {
    try {
      window.localStorage.setItem(
        activeImageConversationStorageKey(getCachedAuthSession()),
        conversationId,
      );
    } catch {
      // Ignore storage access errors in private mode.
    }
    window.dispatchEvent(
      new CustomEvent(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, {
        detail: { conversationId },
      }),
    );
    setOpen(false);
    navigate("/image");
  };

  const hasAnyItems =
    queueItems.length > 0 ||
    activeVideoTakes.length > 0 ||
    recentCompletions.length > 0 ||
    recentVideoCompletions.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ImageTaskQueueTrigger
          activeCount={activeCount}
          hasRecentCompletion={hasRecentCompletion}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(calc(100vw-1.5rem),440px)] overflow-hidden rounded-2xl border-border/85 bg-surface-raised p-0 shadow-xl"
      >
        <QueuePopoverHeader
          activeCount={activeCount}
          hasRecentCompletion={hasRecentCompletion}
          onClearCompletions={
            hasRecentCompletion
              ? () => {
                  setRecentCompletions([]);
                  setRecentVideoCompletions([]);
                }
              : undefined
          }
        />
        {hasAnyItems ? (
          <div
            aria-live="polite"
            className="thin-scrollbar max-h-[min(64vh,520px)] overflow-y-auto bg-surface-subtle/60 p-3 dark:bg-surface-subtle/35"
          >
            <div className="flex flex-col gap-2.5">
              {recentVideoCompletions.map((entry) => (
                <VideoCompletionItem
                  key={`${entry.take.taskId}:${entry.completedAt}`}
                  take={entry.take}
                  onOpenVideo={() => {
                    setOpen(false);
                    navigate("/video");
                  }}
                />
              ))}
              {recentCompletions.map((item) => (
                <CompletionItem
                  key={`${item.key}:${item.completedAt}`}
                  item={item}
                  onOpenConversation={openConversation}
                />
              ))}
              {activeVideoTakes.map((take) => (
                <VideoQueueItem
                  key={take.taskId}
                  take={take}
                  onOpenVideo={() => {
                    setOpen(false);
                    navigate("/video");
                  }}
                />
              ))}
              {queueItems.map((item) => (
                <QueueItem
                  key={`${item.conversationId}:${item.turn.id}`}
                  item={item}
                  now={now}
                  onOpenConversation={openConversation}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyQueueState
            onOpenImage={() => {
              setOpen(false);
              navigate("/image");
            }}
            onOpenVideo={() => {
              setOpen(false);
              navigate("/video");
            }}
          />
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-surface px-3.5 py-2 text-xs text-muted-foreground">
          <span>生图与视频任务实时状态</span>
          <div className="flex items-center gap-1.5">
            {canOpenTaskCenter ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/task-queue");
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                <span>前往任务中心</span>
                <ArrowUpRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/image-manager");
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                <span>打开素材中心</span>
                <ArrowUpRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ImageTaskQueueTrigger({
  activeCount,
  hasRecentCompletion,
  className,
}: {
  activeCount: number;
  hasRecentCompletion: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "relative h-8 rounded-lg px-2 shadow-none",
        activeCount > 0
          ? "bg-surface-muted font-medium text-foreground ring-1 ring-border hover:bg-surface-hover"
          : hasRecentCompletion
            ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        className,
      )}
      aria-label={
        activeCount > 0
          ? `查看 ${activeCount} 个正在处理的创作任务`
          : hasRecentCompletion
            ? "查看最近完成的创作任务"
            : "查看创作任务队列"
      }
      title="创作任务队列"
    >
      {hasRecentCompletion ? (
        <span className="pointer-events-none absolute -inset-0.5 rounded-lg border border-emerald-400/60 animate-ping" />
      ) : null}
      {activeCount > 0 ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : hasRecentCompletion ? (
        <CheckCircle2 className="size-3.5 animate-in zoom-in-50 duration-300" />
      ) : (
        <ClipboardList className="size-3.5" />
      )}
      <span className="hidden text-xs font-medium xl:inline">队列</span>
      {activeCount > 0 ? (
        <span className="absolute -top-1 -right-1 inline-flex min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-4.5 text-background tabular-nums">
          {activeCount}
        </span>
      ) : null}
    </Button>
  );
}

function QueuePopoverHeader({
  activeCount,
  hasRecentCompletion,
  onClearCompletions,
}: {
  activeCount: number;
  hasRecentCompletion: boolean;
  onClearCompletions?: () => void;
}) {
  const subtitle =
    activeCount > 0
      ? `${activeCount} 个创作任务正在排队或渲染`
      : hasRecentCompletion
        ? "最近完成的创作任务"
        : "当前无进行中的图片或视频任务";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground ring-1 ring-border/70">
          <ClipboardList className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">创作队列</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      {onClearCompletions ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClearCompletions}
          className="h-7 gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="size-3" />
          <span>清理已完成</span>
        </Button>
      ) : null}
    </div>
  );
}

function VideoCompletionItem({
  take,
  onOpenVideo,
}: {
  take: RecentVideoTake;
  onOpenVideo: () => void;
}) {
  const succeeded = take.status === "success";
  return (
    <button
      type="button"
      onClick={onOpenVideo}
      className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left shadow-2xs transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
            succeeded
              ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
              : "bg-rose-500/15 text-rose-700 ring-rose-500/25 dark:text-rose-300",
          )}
        >
          {succeeded ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
              <Film className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{succeeded ? "视频渲染完成" : "视频任务已结束"}</span>
            </span>
            <span className="shrink-0 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              点击查看
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {take.prompt || "无提示词内容"}
          </p>
        </div>
      </div>
    </button>
  );
}

function VideoQueueItem({
  take,
  onOpenVideo,
}: {
  take: RecentVideoTake;
  onOpenVideo: () => void;
}) {
  const isQueued = take.status === "queued";
  return (
    <button
      type="button"
      onClick={onOpenVideo}
      className="w-full rounded-xl border border-border/75 bg-surface p-3 text-left shadow-2xs transition hover:border-foreground/20 hover:bg-surface-hover"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
            isQueued
              ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
              : "bg-surface-muted text-foreground ring-border",
          )}
        >
          {isQueued ? (
            <Clock3 className="size-4" />
          ) : (
            <LoaderCircle className="size-4 animate-spin" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
              <Film className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">视频暗房任务</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1",
                isQueued
                  ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
                  : "bg-surface-muted text-foreground ring-border",
              )}
            >
              {isQueued ? "排队中" : "渲染中"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {take.prompt || "无提示词内容"}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-surface-muted px-2 py-0.5">
                {take.ratio}
              </span>
              <span className="rounded-md bg-surface-muted px-2 py-0.5 uppercase">
                {take.resolutionName}
              </span>
              <span className="rounded-md bg-surface-muted px-2 py-0.5 tabular-nums">
                {take.seconds}s
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {formatQueueTime(take.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyQueueState({
  onOpenImage,
  onOpenVideo,
}: {
  onOpenImage: () => void;
  onOpenVideo: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-9 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground ring-1 ring-border/70">
        <CheckCircle2 className="size-5" />
      </span>
      <div className="mt-3 text-sm font-semibold text-foreground">队列空闲</div>
      <div className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
        提交图片或视频生成任务后，这里将实时追踪排队与渲染进度。
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg px-3 text-xs"
          onClick={onOpenImage}
        >
          <Sparkles className="size-3.5" />
          图片创作
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-3 text-xs"
          onClick={onOpenVideo}
        >
          <Film className="size-3.5" />
          视频创作
        </Button>
      </div>
    </div>
  );
}
