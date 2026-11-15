"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Images,
  KeyRound,
  LoaderCircle,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { isImeComposing } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import {
  getImageConversationStats,
  type ImageConversation,
} from "@/store/image-conversations";

type ImageSidebarProps = {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  onRenameConversation?: (id: string, title: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  embeddedInDialog?: boolean;
  onCollapse?: () => void;
};

export function ImageSidebar({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  onCreateDraft,
  onClearHistory,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
  embeddedInDialog = false,
  onCollapse,
}: ImageSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState<ImageConversation | null>(null);
  const [deletingOne, setDeletingOne] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.title.toLocaleLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      await onClearHistory();
      setClearConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  };

  const handleConfirmDeleteOne = async () => {
    if (!deletingConversation) return;
    setDeletingOne(true);
    try {
      await onDeleteConversation(deletingConversation.id);
      setDeletingConversation(null);
    } finally {
      setDeletingOne(false);
    }
  };

  const startRename = (conversation: ImageConversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const commitRename = async (conversation: ImageConversation) => {
    const trimmed = editingTitle.trim();
    setEditingId(null);
    setEditingTitle("");
    if (!trimmed || trimmed === conversation.title || !onRenameConversation) {
      return;
    }
    await onRenameConversation(conversation.id, trimmed);
  };

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2.5 py-0.5">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold tracking-tight text-[#45515e] dark:text-muted-foreground">
              {embeddedInDialog ? `会话列表 (${conversations.length})` : "历史对话"}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="清空历史记录"
                title="清空历史记录"
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#f3f6fb] hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/[0.06]"
                onClick={() => setClearConfirmOpen(true)}
                disabled={conversations.length === 0}
              >
                <Trash2 className="size-3.5" />
              </button>
              {!embeddedInDialog && onCollapse ? (
                <button
                  type="button"
                  aria-label="收起会话列表"
                  title="收起会话列表"
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#f3f6fb] hover:text-foreground dark:hover:bg-white/[0.06]"
                  onClick={onCollapse}
                >
                  <PanelLeftClose className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#1456f0] px-3.5 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(20,86,240,0.22)] transition hover:bg-[#1048ce] active:scale-[0.985]"
            onClick={onCreateDraft}
          >
            <MessageSquarePlus className="size-4" />
            <span>+ 新建对话</span>
          </button>
        </div>

        {conversations.length > 3 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索历史对话…"
              aria-label="搜索历史会话"
              className="h-8.5 w-full rounded-full border border-border bg-[#f5f8fc] pr-7 pl-8.5 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-[#1456f0]/50 focus:bg-white dark:bg-surface-muted/70 dark:focus:bg-surface"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2.5 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "thin-scrollbar min-h-0 flex-1 overflow-y-auto",
            embeddedInDialog
              ? "flex flex-col gap-1.5 pr-0"
              : "flex flex-col gap-1.5 py-0.5 pr-0.5",
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin text-[#1456f0] dark:text-sky-400" />
              <span>正在读取会话记录…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-[#f6f9fe] px-3 py-6 text-center dark:bg-surface-muted/35">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/45 dark:text-sky-300">
                <Sparkles className="size-4" />
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">还没有图片记录</p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  在下方输入提示词或套用预设后，对话会显示在这里
                </p>
              </div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">
              <p>未找到匹配的会话记录</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 inline-flex h-7 items-center gap-1 rounded-full border border-border bg-white px-3 text-[11px] font-medium text-foreground transition hover:bg-[#f3f6fb] dark:bg-surface dark:hover:bg-surface-hover"
              >
                <X className="size-3" />
                <span>清空搜索</span>
              </button>
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const isEditing = editingId === conversation.id;
              const stats = getImageConversationStats(conversation);
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group relative w-full rounded-[16px] border text-left transition-all duration-150",
                    embeddedInDialog ? "px-3.5 py-3" : "px-3 py-2.5",
                    active
                      ? "border-[#cfe0ff] bg-[#edf4ff] text-[#1456f0] shadow-[0_2px_8px_rgba(20,86,240,0.08)] dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300"
                      : "border-transparent text-[#45515e] hover:border-border/80 hover:bg-[#f4f7fc] hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/[0.05] dark:hover:text-foreground",
                  )}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (isImeComposing(event)) {
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitRename(conversation);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        aria-label="编辑会话标题"
                        autoFocus
                        maxLength={80}
                        className="h-7 min-w-0 flex-1 rounded-lg border border-[#1456f0]/40 bg-white px-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-[#1456f0]/25 dark:bg-surface"
                      />
                      <button
                        type="button"
                        onClick={() => void commitRename(conversation)}
                        disabled={!editingTitle.trim()}
                        aria-label="保存会话标题"
                        title="保存"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-emerald-600 transition hover:bg-white/80 disabled:opacity-40 dark:text-emerald-400"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        aria-label="取消重命名"
                        title="取消"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/80 hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectConversation(conversation.id)}
                        className={cn(
                          "block w-full text-left",
                          onRenameConversation ? "pr-12" : "pr-7",
                        )}
                      >
                        <div
                          className={cn(
                            "truncate",
                            active
                              ? "font-semibold text-[#1456f0] dark:text-sky-200"
                              : "font-semibold text-[#222222] group-hover:text-[#1456f0] dark:text-foreground/90 dark:group-hover:text-sky-300",
                            embeddedInDialog ? "text-sm" : "text-[13px]",
                          )}
                        >
                          <span className="truncate">{conversation.title}</span>
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums",
                            active
                              ? "text-[#1456f0]/80 dark:text-sky-300/80"
                              : "text-[#8e8e93] dark:text-muted-foreground",
                          )}
                        >
                          <span>{conversation.turns.length} 轮</span>
                          <span>·</span>
                          <span>{formatConversationTime(conversation.updatedAt)}</span>
                        </div>
                        {stats.running > 0 || stats.queued > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                            {stats.running > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[#1456f0] shadow-2xs dark:bg-sky-900/50 dark:text-sky-200">
                                <span className="size-1.5 animate-pulse rounded-full bg-[#1456f0] dark:bg-sky-400" />
                                处理中 {stats.running}
                              </span>
                            ) : null}
                            {stats.queued > 0 ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                排队 {stats.queued}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                      <div
                        className={cn(
                          "absolute top-2.5 right-1.5 flex items-center gap-0.5 transition",
                          embeddedInDialog
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                        )}
                      >
                        {onRenameConversation ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startRename(conversation);
                            }}
                            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/80 hover:text-foreground dark:hover:bg-white/[0.08]"
                            aria-label="重命名会话"
                            title="重命名会话"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletingConversation(conversation);
                          }}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          aria-label="删除会话"
                          title="删除会话"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!embeddedInDialog ? (
          <div className="space-y-1.5 border-t border-border/65 pt-2">
            <div className="flex items-center gap-1.5">
              <Link
                to="/image-manager"
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#f4f7fc] px-2 text-[11px] font-medium text-[#45515e] transition-colors hover:bg-[#edf4ff] hover:text-[#1456f0] dark:bg-surface-muted/75 dark:text-muted-foreground dark:hover:bg-surface-hover dark:hover:text-foreground"
              >
                <Images className="size-3.5" />
                <span>素材中心</span>
              </Link>
              <Link
                to="/profile?tab=api"
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#f4f7fc] px-2 text-[11px] font-medium text-[#45515e] transition-colors hover:bg-[#edf4ff] hover:text-[#1456f0] dark:bg-surface-muted/75 dark:text-muted-foreground dark:hover:bg-surface-hover dark:hover:text-foreground"
              >
                <KeyRound className="size-3.5" />
                <span>API 文档</span>
              </Link>
            </div>
            <StudioStatsPopover variant="sidebar-footer" align="start" side="top" />
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(deletingConversation)}
        title="确认删除该对话记录？"
        description={
          deletingConversation
            ? `即将删除会话「${deletingConversation.title}」（共 ${deletingConversation.turns.length} 轮记录）。已归档在素材中心的图片不会删除，但本地对话历史删除后不可恢复。`
            : ""
        }
        confirmLabel="确认删除"
        destructive
        pending={deletingOne}
        onClose={() => setDeletingConversation(null)}
        onConfirm={() => void handleConfirmDeleteOne()}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="确认清空全部历史对话？"
        description={`将移除当前账号下的全部 ${conversations.length} 条会话记录。此操作不可恢复。`}
        confirmLabel="确认清空"
        destructive
        pending={clearing}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => void handleConfirmClear()}
      />
    </aside>
  );
}
