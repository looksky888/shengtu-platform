"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ClipboardList, LoaderCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isTurnBusy } from "@/lib/image-turn-state";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";
import {
  ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY,
  IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT,
} from "@/store/image-conversations";
import { getImageTurnProgressSnapshot, subscribeImageTurnProgress } from "@/store/image-turn-progress";

import { CompletionItem, QueueItem } from "./image-task-queue-items";
import {
  findQueueItem,
  getTaskQueueItems,
  isTerminalTurnStatus,
  useImageConversationsForQueue,
  type RecentQueueCompletion,
  type TaskQueueItem,
} from "./image-task-queue-utils";

export function ImageTaskQueue({ className }: { className?: string }) {
  const navigate = useNavigate();
  const conversations = useImageConversationsForQueue();
  const progressByTurnKey = useSyncExternalStore(subscribeImageTurnProgress, getImageTurnProgressSnapshot, getImageTurnProgressSnapshot);
  const queueItems = useMemo(() => getTaskQueueItems(conversations), [conversations]);
  const [recentCompletions, setRecentCompletions] = useState<RecentQueueCompletion[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pageVisible = usePageVisible();
  const previousQueueItemsRef = useRef<Map<string, TaskQueueItem>>(new Map());
  const activeCount = queueItems.length;
  const hasRecentCompletion = recentCompletions.length > 0;

  useEffect(() => {
    const currentItems = new Map(queueItems.map((item) => [`${item.conversationId}:${item.turn.id}`, item]));
    const completedItems: RecentQueueCompletion[] = [];
    previousQueueItemsRef.current.forEach((previousItem, key) => {
      if (currentItems.has(key)) return;
      const completedItem = findQueueItem(conversations, previousItem.conversationId, previousItem.turn.id);
      if (!completedItem || isTurnBusy(completedItem.turn) || !isTerminalTurnStatus(completedItem.turn.status)) return;
      completedItems.push({ ...completedItem, key, completedAt: Date.now(), finalStatus: completedItem.turn.status });
    });
    previousQueueItemsRef.current = currentItems;
    if (completedItems.length > 0) setRecentCompletions((current) => [...completedItems, ...current].slice(0, 3));
  }, [conversations, queueItems]);

  useEffect(() => {
    if (recentCompletions.length === 0) return;
    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 4500;
      setRecentCompletions((current) => current.filter((item) => item.completedAt >= cutoff));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [recentCompletions]);

  useEffect(() => {
    if (!pageVisible || (!open && activeCount === 0 && Object.keys(progressByTurnKey).length === 0 && !hasRecentCompletion)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeCount, hasRecentCompletion, open, pageVisible, progressByTurnKey]);

  const openConversation = (conversationId: string) => {
    try {
      window.localStorage.setItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY, conversationId);
    } catch {
      // Ignore storage access errors in private mode.
    }
    window.dispatchEvent(new CustomEvent(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, { detail: { conversationId } }));
    setOpen(false);
    navigate("/image");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ImageTaskQueueTrigger activeCount={activeCount} hasRecentCompletion={hasRecentCompletion} className={className} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(calc(100vw-2rem),460px)] p-0">
        <QueuePopoverHeader activeCount={activeCount} hasRecentCompletion={hasRecentCompletion} />
        {queueItems.length > 0 || recentCompletions.length > 0 ? (
          <div aria-live="polite" className="max-h-[min(68vh,560px)] overflow-y-auto bg-surface-subtle/60 p-3 dark:bg-background">
            <div className="flex flex-col gap-3">
              {recentCompletions.map((item) => <CompletionItem key={`${item.key}:${item.completedAt}`} item={item} onOpenConversation={openConversation} />)}
              {queueItems.map((item) => <QueueItem key={`${item.conversationId}:${item.turn.id}`} item={item} now={now} onOpenConversation={openConversation} />)}
            </div>
          </div>
        ) : (
          <EmptyQueueState onOpenImage={() => { setOpen(false); navigate("/image"); }} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function ImageTaskQueueTrigger({ activeCount, hasRecentCompletion, className }: { activeCount: number; hasRecentCompletion: boolean; className?: string }) {
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
        className
      )}
      aria-label={activeCount > 0 ? `查看 ${activeCount} 个正在处理的任务` : hasRecentCompletion ? "查看最近完成的任务" : "查看任务队列"}
      title="任务队列"
    >
      {hasRecentCompletion ? <span className="pointer-events-none absolute -inset-0.5 rounded-lg border border-emerald-400/60 animate-ping" /> : null}
      {activeCount > 0 ? <LoaderCircle className="size-3.5 animate-spin" /> : hasRecentCompletion ? <CheckCircle2 className="size-3.5 animate-in zoom-in-50 duration-300" /> : <ClipboardList className="size-3.5" />}
      <span className="hidden text-xs font-medium xl:inline">队列</span>
      {activeCount > 0 ? <span className="absolute -top-1 -right-1 inline-flex min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-4.5 text-background">{activeCount}</span> : null}
    </Button>
  );
}

function QueuePopoverHeader({ activeCount, hasRecentCompletion }: { activeCount: number; hasRecentCompletion: boolean }) {
  const subtitle = activeCount > 0 ? `${activeCount} 个任务正在排队或处理` : hasRecentCompletion ? "最近完成的任务" : "暂无待处理任务";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="size-4" /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">任务队列</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyQueueState({ onOpenImage }: { onOpenImage: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><CheckCircle2 className="size-5" /></span>
      <div className="mt-3 text-sm font-semibold text-foreground">队列为空</div>
      <div className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">在创作台提交图片或对话任务后，这里会显示对应的处理状态和进度。</div>
      <Button type="button" size="sm" className="mt-4 h-8 rounded-lg px-3 text-xs" onClick={onOpenImage}>
        <Sparkles className="size-3.5" />打开创作台
      </Button>
    </div>
  );
}
