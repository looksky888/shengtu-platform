"use client";

import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { History, PanelLeftOpen, Plus, Trash2 } from "lucide-react";

import { ImageSidebar } from "@/app/image/components/image-sidebar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImageConversation } from "@/store/image-conversations";

type ImagePageWorkspaceProps = {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  resultsViewportRef: RefObject<HTMLDivElement | null>;
  composerDockRef: RefObject<HTMLDivElement | null>;
  composerDockHeight: number;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onOpenHistory: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  overlays: ReactNode;
  results: ReactNode;
  composer: ReactNode;
};

export function ImagePageWorkspace({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  resultsViewportRef,
  composerDockRef,
  composerDockHeight,
  onCreateDraft,
  onClearHistory,
  onOpenHistory,
  onSelectConversation,
  onDeleteConversation,
  formatConversationTime,
  overlays,
  results,
  composer,
}: ImagePageWorkspaceProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <section
      className={cn(
        "mx-auto grid h-[calc(100dvh-5rem)] min-h-0 w-full max-w-[1400px] grid-cols-1 gap-2 px-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:h-[calc(100dvh-4.75rem)] sm:gap-3 sm:px-2 sm:pb-4",
        sidebarCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)]"
          : "lg:grid-cols-[248px_minmax(0,1fr)]"
      )}
    >
      {!sidebarCollapsed ? (
        <div className="hidden h-full min-h-0 rounded-xl border border-border/70 bg-card/85 px-2.5 py-2 shadow-2xs lg:block">
          <ImageSidebar
            conversations={conversations}
            isLoadingHistory={isLoadingHistory}
            selectedConversationId={selectedConversationId}
            onCreateDraft={onCreateDraft}
            onClearHistory={onClearHistory}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            formatConversationTime={formatConversationTime}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
      ) : null}

      {overlays}

      <div className="relative flex min-h-0 flex-col gap-2 rounded-xl lg:border lg:border-border/70 lg:bg-card/65 lg:p-2">
        {sidebarCollapsed ? (
          <div className="hidden items-center gap-2 px-2 pt-1 lg:flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSidebarCollapsed(false)}
              title="展开会话列表"
            >
              <PanelLeftOpen className="size-4" />
              <span>会话列表 ({conversations.length})</span>
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={onCreateDraft}
            >
              <Plus className="size-4" />
              <span>新建对话</span>
            </Button>
          </div>
        ) : null}

        <MobileToolbar
          conversationsCount={conversations.length}
          onOpenHistory={onOpenHistory}
          onCreateDraft={onCreateDraft}
          onClearHistory={onClearHistory}
        />

        <div
          ref={resultsViewportRef}
          className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pt-2 pb-[14rem] sm:px-4 sm:pt-3 sm:pb-[15rem]"
          style={
            composerDockHeight > 0
              ? { paddingBottom: composerDockHeight + 24 }
              : undefined
          }
        >
          {results}
        </div>

        <div
          ref={composerDockRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-4 sm:pb-2"
          style={
            {
              "--image-composer-dock-height": `${composerDockHeight}px`,
            } as CSSProperties
          }
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[900px]">
            {composer}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileToolbar({
  conversationsCount,
  onOpenHistory,
  onCreateDraft,
  onClearHistory,
}: {
  conversationsCount: number;
  onOpenHistory: () => void;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      await onClearHistory();
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-1 sm:px-4 lg:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="outline"
          className="h-9 min-w-0 flex-1 shrink rounded-lg shadow-2xs"
          onClick={onOpenHistory}
        >
          <History className="size-4" />
          <span className="truncate">历史会话 ({conversationsCount})</span>
        </Button>
        <Button
          variant="brand"
          className="h-9 rounded-lg shadow-2xs"
          onClick={onCreateDraft}
        >
          <Plus className="size-4" />
          <span>新建</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="清空历史记录"
          title="清空历史记录"
          className="size-9 rounded-lg shadow-2xs hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={conversationsCount === 0}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="确认清空全部创作会话？"
        description={`将移除当前账号下的全部 ${conversationsCount} 条会话记录。此操作不可恢复。`}
        confirmLabel="确认清空"
        destructive
        pending={clearing}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirmClear()}
      />
    </div>
  );
}
