import { CheckCircle2, Clock3, LoaderCircle } from "lucide-react";

import { formatElapsedClock } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { getImageTurnProgressSnapshot, imageTurnProgressKey } from "@/store/image-turn-progress";

import {
  formatQueueTime,
  getCompletionTone,
  getModeLabel,
  getStatusClass,
  getStatusLabel,
  type RecentQueueCompletion,
  type TaskQueueItem,
} from "./image-task-queue-utils";

export function QueueItem({ item, now, onOpenConversation }: { item: TaskQueueItem; now: number; onOpenConversation: (conversationId: string) => void }) {
  const progress = getImageTurnProgressSnapshot()[imageTurnProgressKey(item.conversationId, item.turn.id)];
  const settledCount = item.completedCount + item.failedCount + item.cancelledCount;
  const progressPercent = settledCount > 0 ? Math.min(100, Math.round((settledCount / item.totalCount) * 100)) : item.turn.status === "generating" ? 8 : 0;
  const elapsed = progress && Number.isFinite(progress.startedAt) ? formatElapsedClock(Math.floor((now - progress.startedAt) / 1000)) : "";
  const detailParts = [getModeLabel(item.turn.mode), item.turn.model, item.turn.size, item.turn.quality ? `Quality ${item.turn.quality}` : ""].filter(Boolean);
  const progressMessage = progress?.message || (item.turn.status === "queued" ? "\u7b49\u5f85\u524d\u5e8f\u4efb\u52a1" : item.turn.mode === "chat" ? "\u7b49\u5f85\u5bf9\u8bdd\u56de\u590d" : "\u7b49\u5f85\u751f\u6210\u7ed3\u679c");
  const progressDetail = progress?.detail || (item.turn.mode === "chat" ? "\u5bf9\u8bdd\u4efb\u52a1\u5904\u7406\u4e2d" : item.loadingCount > 0 ? `\u8fd8\u6709 ${item.loadingCount} \u5f20\u56fe\u7247\u5904\u7406\u4e2d` : "");

  return (
    <button type="button" className="w-full rounded-2xl border border-[#f2f3f5] bg-white p-3 text-left shadow-[0_4px_6px_rgba(0,0,0,0.05)] transition hover:border-[#dbe7ff] hover:bg-[#f8fbff] dark:border-border dark:bg-card dark:hover:bg-accent/40" onClick={() => onOpenConversation(item.conversationId)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1", item.turn.status === "queued" ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-sky-50 text-[#1456f0] ring-sky-100")}>
          {item.turn.status === "queued" ? <Clock3 className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <QueueItemHeader item={item} />
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">{item.turn.prompt || "\u65e0\u63d0\u793a\u8bcd\u5185\u5bb9"}</p>
          <QueueItemMeta detailParts={detailParts} item={item} />
          <QueueItemProgress progressMessage={progressMessage} progressDetail={progressDetail} progressPercent={progressPercent} elapsed={elapsed} createdAt={item.turn.createdAt} />
        </div>
      </div>
    </button>
  );
}

export function CompletionItem({ item, onOpenConversation }: { item: RecentQueueCompletion; onOpenConversation: (conversationId: string) => void }) {
  const tone = getCompletionTone(item.finalStatus);
  const settledCount = item.completedCount + item.failedCount + item.cancelledCount;
  const resultText = item.finalStatus === "success" || item.finalStatus === "message" ? `${settledCount}/${item.totalCount} \u5f20\u5b8c\u6210` : item.turn.error || getStatusLabel(item.finalStatus);
  return (
    <button type="button" className="animate-in fade-in slide-in-from-top-1 zoom-in-95 w-full rounded-2xl border border-emerald-100 bg-white p-3 text-left shadow-[0_12px_24px_-18px_rgba(16,185,129,0.55)] duration-300 hover:border-emerald-200 hover:bg-emerald-50/45 dark:border-emerald-900/50 dark:bg-card dark:hover:bg-emerald-950/20" onClick={() => onOpenConversation(item.conversationId)}>
      <div className="flex items-start gap-3">
        <span className={cn("relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1", tone.iconClass)}>
          <span className="absolute inset-0 rounded-full bg-current opacity-15 animate-ping" />
          <CheckCircle2 className="relative size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">{item.conversationTitle || item.turn.prompt || "\u672a\u547d\u540d\u4efb\u52a1"}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", tone.badgeClass)}>{getStatusLabel(item.finalStatus)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">{item.turn.prompt || "\u65e0\u63d0\u793a\u8bcd\u5185\u5bb9"}</p>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
              <span className="truncate font-medium text-[#222222] dark:text-foreground">{tone.message}</span>
              <span className="shrink-0 font-mono tabular-nums">{resultText}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted"><div className={cn("h-full animate-pulse rounded-full", tone.barClass)} style={{ width: "100%" }} /></div>
          </div>
        </div>
      </div>
    </button>
  );
}

function QueueItemHeader({ item }: { item: TaskQueueItem }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <p className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">{item.conversationTitle || item.turn.prompt || "\u672a\u547d\u540d\u4efb\u52a1"}</p>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", getStatusClass(item.turn.status))}>{getStatusLabel(item.turn.status)}</span>
    </div>
  );
}

function QueueItemMeta({ detailParts, item }: { detailParts: string[]; item: TaskQueueItem }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e] dark:text-muted-foreground">
      {detailParts.map((part, index) => <span key={`${part}-${index}`} className="rounded-full bg-[#f0f0f0] px-2 py-0.5 dark:bg-muted">{part}</span>)}
      <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 font-mono tabular-nums dark:bg-muted">{item.completedCount + item.failedCount + item.cancelledCount}/{item.totalCount}</span>
    </div>
  );
}

function QueueItemProgress({ progressMessage, progressDetail, progressPercent, elapsed, createdAt }: { progressMessage: string; progressDetail: string; progressPercent: number; elapsed: string; createdAt: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
        <span className="truncate font-medium text-[#222222] dark:text-foreground">{progressMessage}</span>
        <span className="shrink-0 font-mono tabular-nums">{progressPercent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted"><div className="h-full rounded-full bg-[#1456f0] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#8e8e93] dark:text-muted-foreground">
        <span className="truncate">{progressDetail || formatQueueTime(createdAt)}</span>
        {elapsed ? <span className="shrink-0 font-mono tabular-nums">{"\u5df2\u7b49\u5f85"} {elapsed}</span> : null}
      </div>
    </div>
  );
}
