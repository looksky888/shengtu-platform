"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ClipboardList, LoaderCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  isTurnBusy,
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
    window.localStorage.setItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY, conversationId);
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
          <div aria-live="polite" className="max-h-[min(68vh,560px)] overflow-y-auto bg-[#fbfcfe] p-3 dark:bg-background">
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
      variant="outline"
      className={cn("relative h-9 rounded-full px-2.5 shadow-none", activeCount > 0 ? "border-sky-200 bg-sky-50 text-[#1456f0] hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300" : hasRecentCompletion ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground", className)}
      aria-label={activeCount > 0 ? `\u67e5\u770b ${activeCount} \u4e2a\u6b63\u5728\u5904\u7406\u7684\u4efb\u52a1` : hasRecentCompletion ? "\u67e5\u770b\u6700\u8fd1\u5b8c\u6210\u7684\u4efb\u52a1" : "\u67e5\u770b\u4efb\u52a1\u961f\u5217"}
      title={"\u4efb\u52a1\u961f\u5217"}
    >
      {hasRecentCompletion ? <span className="pointer-events-none absolute -inset-1 rounded-full border border-emerald-300/70 animate-ping" /> : null}
      {activeCount > 0 ? <LoaderCircle className="size-4 animate-spin" /> : hasRecentCompletion ? <CheckCircle2 className="size-4 animate-in zoom-in-50 duration-300" /> : <ClipboardList className="size-4" />}
      <span className="hidden text-xs font-medium xl:inline">{"\u4efb\u52a1\u961f\u5217"}</span>
      {activeCount > 0 ? <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#1456f0] px-1.5 text-[10px] font-semibold leading-5 text-white">{activeCount}</span> : null}
    </Button>
  );
}

function QueuePopoverHeader({ activeCount, hasRecentCompletion }: { activeCount: number; hasRecentCompletion: boolean }) {
  const subtitle = activeCount > 0 ? `${activeCount} \u4e2a\u4efb\u52a1\u6b63\u5728\u6392\u961f\u6216\u5904\u7406` : hasRecentCompletion ? "\u6700\u8fd1\u5b8c\u6210\u7684\u4efb\u52a1" : "\u6682\u65e0\u5f85\u5904\u7406\u4efb\u52a1";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f2f3f5] px-4 py-3 dark:border-border">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"><ClipboardList className="size-4" /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#222222] dark:text-foreground">{"\u4efb\u52a1\u961f\u5217"}</div>
          <div className="text-xs text-[#8e8e93] dark:text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyQueueState({ onOpenImage }: { onOpenImage: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[#f0f0f0] text-[#45515e] dark:bg-muted dark:text-muted-foreground"><CheckCircle2 className="size-5" /></span>
      <div className="mt-3 text-sm font-semibold text-[#222222] dark:text-foreground">{"\u961f\u5217\u4e3a\u7a7a"}</div>
      <div className="mt-1 max-w-[260px] text-xs leading-5 text-[#8e8e93] dark:text-muted-foreground">{"\u5728\u521b\u4f5c\u53f0\u63d0\u4ea4\u56fe\u7247\u6216\u5bf9\u8bdd\u4efb\u52a1\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5bf9\u5e94\u7684\u5904\u7406\u72b6\u6001\u548c\u8fdb\u5ea6\u3002"}</div>
      <Button type="button" size="sm" className="mt-4 h-8 rounded-full bg-[#1456f0] px-3 text-xs text-white hover:bg-[#2563eb]" onClick={onOpenImage}>
        <Sparkles className="size-3.5" />{"\u6253\u5f00\u521b\u4f5c\u53f0"}
      </Button>
    </div>
  );
}
