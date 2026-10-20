"use client";

import { useMemo, useState } from "react";
import {
  LoaderCircle,
  MessageSquarePlus,
  PanelLeftClose,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
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
  formatConversationTime: (value: string) => string;
  hideActionButtons?: boolean;
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
  formatConversationTime,
  hideActionButtons = false,
  onCollapse,
}: ImageSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.title.toLocaleLowerCase().includes(q)
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

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2.5 py-1 sm:py-2">
        {!hideActionButtons && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="brand"
              size="default"
              className="flex-1 rounded-xl"
              onClick={onCreateDraft}
            >
              <MessageSquarePlus className="size-4" />
              <span>新建对话</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="清空历史记录"
              title="清空历史记录"
              className="rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setClearConfirmOpen(true)}
              disabled={conversations.length === 0}
            >
              <Trash2 className="size-4" />
            </Button>
            {onCollapse ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="收起会话列表"
                title="收起会话列表"
                className="rounded-xl text-muted-foreground"
                onClick={onCollapse}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            ) : null}
          </div>
        )}

        {conversations.length > 3 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索历史会话…"
              aria-label="搜索历史会话"
              className="h-8 w-full rounded-lg border border-border/75 bg-surface-muted/65 pr-7 pl-8 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand/50 focus:bg-surface"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
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
            hideActionButtons
              ? "flex flex-col gap-1 pr-0"
              : "flex flex-col gap-1.5 pr-1"
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              <span>正在读取会话记录…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-surface-muted/30 px-3 py-5 text-center text-xs leading-5 text-muted-foreground">
              还没有创作记录，输入提示词生成后会在这里显示。
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">
              未找到匹配的会话记录
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const stats = getImageConversationStats(conversation);
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group relative w-full rounded-xl border text-left transition-all duration-150",
                    hideActionButtons ? "px-3.5 py-3" : "px-3 py-2.5",
                    active
                      ? "border-brand-border bg-brand-soft/75 text-foreground shadow-2xs"
                      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-hover hover:text-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      "block w-full text-left",
                      hideActionButtons ? "pr-0" : "pr-7"
                    )}
                  >
                    <div
                      className={cn(
                        "truncate font-medium",
                        active && "font-semibold text-brand",
                        hideActionButtons ? "text-sm" : "text-[13px]"
                      )}
                    >
                      <span className="truncate">{conversation.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                      <span>{conversation.turns.length} 轮</span>
                      <span>·</span>
                      <span>{formatConversationTime(conversation.updatedAt)}</span>
                    </div>
                    {stats.running > 0 || stats.queued > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                        {stats.running > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-brand">
                            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                            生成中 {stats.running}
                          </span>
                        ) : null}
                        {stats.queued > 0 ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                            排队 {stats.queued}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                  {!hideActionButtons ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeleteConversation(conversation.id);
                      }}
                      className="absolute top-2.5 right-2 inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      aria-label="删除会话"
                      title="删除会话"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="确认清空全部创作会话？"
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
