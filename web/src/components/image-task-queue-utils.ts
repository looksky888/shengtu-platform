import { useEffect, useState } from "react";

import { formatDateTime } from "@/lib/datetime";
import { isTurnBusy } from "@/lib/image-turn-state";
import {
  IMAGE_CONVERSATIONS_CHANGED_EVENT,
  listImageConversations,
  type ImageConversation,
  type ImageConversationMode,
  type ImageTurn,
  type ImageTurnStatus,
} from "@/store/image-conversations";

export type TaskQueueItem = {
  conversationId: string;
  conversationTitle: string;
  turn: ImageTurn;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  loadingCount: number;
};

export type RecentQueueCompletion = TaskQueueItem & {
  key: string;
  completedAt: number;
  finalStatus: ImageTurnStatus;
};

export function isTerminalTurnStatus(status: ImageTurnStatus) {
  return status === "success" || status === "message" || status === "error" || status === "cancelled";
}

export function formatQueueTime(value: string) {
  const text = formatDateTime(value, { compact: true });
  return text === "—" ? "" : text;
}

export function getModeLabel(mode: ImageConversationMode) {
  if (mode === "chat") return "对话";
  if (mode === "edit") return "图生图";
  if (mode === "image") return "文生图";
  return "任务";
}

export function getStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") return "排队中";
  if (status === "generating") return "生成中";
  if (status === "success") return "已完成";
  if (status === "message") return "已回复";
  if (status === "cancelled") return "已终止";
  return "失败";
}

export function getStatusClass(status: ImageTurnStatus) {
  if (status === "queued") return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800";
  if (status === "generating") return "bg-sky-50 text-[#1456f0] ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800";
  return "bg-muted text-muted-foreground ring-border";
}

export function getCompletionTone(status: ImageTurnStatus) {
  if (status === "success" || status === "message") {
    return { iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800", badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800", barClass: "bg-emerald-500", message: "任务已完成" };
  }
  if (status === "cancelled") {
    return { iconClass: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800", badgeClass: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800", barClass: "bg-amber-500", message: "任务已终止" };
  }
  return { iconClass: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800", badgeClass: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800", barClass: "bg-rose-500", message: "任务失败" };
}

export function getQueueItem(conversation: ImageConversation, turn: ImageTurn): TaskQueueItem {
  const completedCount = turn.images.filter((image) => image.status === "success" || image.status === "message").length;
  const failedCount = turn.images.filter((image) => image.status === "error").length;
  const cancelledCount = turn.images.filter((image) => image.status === "cancelled").length;
  const loadingCount = turn.images.filter((image) => image.status === "loading").length;
  const totalCount = Math.max(1, turn.mode === "chat" ? 1 : turn.count || turn.images.length || 1);
  return { conversationId: conversation.id, conversationTitle: conversation.title, turn, totalCount, completedCount, failedCount, cancelledCount, loadingCount };
}

export function getTaskQueueItems(conversations: ImageConversation[]) {
  return conversations
    .flatMap((conversation) => conversation.turns.flatMap((turn) => (isTurnBusy(turn) ? [getQueueItem(conversation, turn)] : [])))
    .sort((a, b) => a.turn.createdAt.localeCompare(b.turn.createdAt));
}

export function findQueueItem(conversations: ImageConversation[], conversationId: string, turnId: string) {
  const conversation = conversations.find((item) => item.id === conversationId);
  const turn = conversation?.turns.find((item) => item.id === turnId);
  return conversation && turn ? getQueueItem(conversation, turn) : null;
}

export function useImageConversationsForQueue() {
  const [conversations, setConversations] = useState<ImageConversation[]>([]);
  useEffect(() => {
    let active = true;
    const loadConversations = async () => {
      try {
        const items = await listImageConversations();
        if (active) setConversations(items);
      } catch {
        if (active) setConversations([]);
      }
    };
    const handleRefresh = () => void loadConversations();
    void loadConversations();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleRefresh);
    };
  }, []);
  return conversations;
}
