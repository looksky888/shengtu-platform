"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { History, PanelLeftOpen, Plus, Trash2 } from "lucide-react";

import { ImageConversationScrollRail } from "@/app/image/components/image-conversation-scroll-rail";
import { ImageSidebar } from "@/app/image/components/image-sidebar";
import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { cn } from "@/lib/utils";
import type { ImageConversation } from "@/store/image-conversations";

type ImagePageWorkspaceProps = {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  resultsViewportRef: RefObject<HTMLDivElement | null>;
  composerDockRef: RefObject<HTMLDivElement | null>;
  composerDockHeight: number;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onOpenHistory: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  onRenameConversation: (id: string, title: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  overlays: ReactNode;
  results: ReactNode;
  composer: ReactNode;
};

export function ImagePageWorkspace({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  isSidebarOpen = true,
  onToggleSidebar,
  resultsViewportRef,
  composerDockRef,
  composerDockHeight,
  onCreateDraft,
  onClearHistory,
  onOpenHistory,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
  overlays,
  results,
  composer,
}: ImagePageWorkspaceProps) {
  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  const turnsCount = selectedConversation?.turns.length ?? 0;

  return (
    <section
      className={cn(
        "mx-auto grid h-[calc(100dvh-6.25rem)] min-h-0 w-full flex-1 max-w-[1380px] grid-cols-1 gap-2 px-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:h-[calc(100dvh-5rem)] sm:gap-3 sm:px-3 sm:pb-4",
        isSidebarOpen ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "lg:grid-cols-1",
      )}
    >
      {isSidebarOpen ? (
        <div className="soft-card-shadow hidden h-full min-h-0 rounded-[24px] border border-border bg-[#fbfdff] p-3 dark:bg-card lg:block">
          <ImageSidebar
            conversations={conversations}
            isLoadingHistory={isLoadingHistory}
            selectedConversationId={selectedConversationId}
            onCreateDraft={onCreateDraft}
            onClearHistory={onClearHistory}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            onRenameConversation={onRenameConversation}
            formatConversationTime={formatConversationTime}
            onCollapse={onToggleSidebar}
          />
        </div>
      ) : null}

      {overlays}

      <div className="relative flex min-h-0 flex-col gap-2 sm:gap-3">
        <WorkspaceTopBar
          conversationsCount={conversations.length}
          selectedTitle={turnsCount > 0 ? selectedConversation?.title : undefined}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          onOpenHistory={onOpenHistory}
          onCreateDraft={onCreateDraft}
          onClearHistory={onClearHistory}
        />

        <div className="relative flex min-h-0 flex-1">
          <div
            ref={resultsViewportRef}
            className={cn(
              "hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pt-1 pb-[14rem] sm:px-4 sm:pt-2 sm:pb-[15rem]",
              turnsCount > 0 && "pr-6 sm:pr-8",
            )}
            style={
              composerDockHeight > 0
                ? { paddingBottom: composerDockHeight + 24 }
                : undefined
            }
          >
            {results}
          </div>

          {turnsCount > 0 ? (
            <ImageConversationScrollRail
              viewportRef={resultsViewportRef}
              turnsCount={turnsCount}
              selectedConversationId={selectedConversationId}
            />
          ) : null}
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

function WorkspaceTopBar({
  conversationsCount,
  selectedTitle,
  isSidebarOpen,
  onToggleSidebar,
  onOpenHistory,
  onCreateDraft,
  onClearHistory,
}: {
  conversationsCount: number;
  selectedTitle?: string;
  isSidebarOpen: boolean;
  onToggleSidebar?: () => void;
  onOpenHistory: () => void;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <button
          type="button"
          className="inline-flex h-10 min-w-0 flex-1 shrink items-center justify-center gap-1.5 rounded-full border border-border bg-[#fbfdff] px-3.5 text-xs font-medium text-[#45515e] shadow-2xs transition hover:bg-[#f3f6fb] dark:bg-card dark:text-foreground dark:hover:bg-white/[0.06]"
          onClick={onOpenHistory}
        >
          <History className="size-4 shrink-0 text-[#1456f0] dark:text-sky-400" />
          <span className="truncate">历史记录 ({conversationsCount})</span>
        </button>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full bg-[#1456f0] px-4 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(20,86,240,0.22)] transition hover:bg-[#1048ce] active:scale-[0.98]"
          onClick={onCreateDraft}
        >
          <Plus className="size-4" />
          <span>新建</span>
        </button>
        <button
          type="button"
          aria-label="清空历史记录"
          title="清空历史记录"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-border bg-[#fbfdff] px-3 text-[#45515e] shadow-2xs transition hover:bg-[#f3f6fb] hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40 dark:bg-card dark:text-muted-foreground dark:hover:bg-white/[0.06]"
          onClick={() => void onClearHistory()}
          disabled={conversationsCount === 0}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        {!isSidebarOpen && onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-[#fbfdff] px-3 text-xs font-medium text-[#45515e] shadow-2xs transition hover:bg-[#f3f6fb] hover:text-[#1456f0] dark:bg-card dark:text-foreground dark:hover:bg-white/[0.06]"
            title="展开左侧会话栏"
          >
            <PanelLeftOpen className="size-3.5 text-[#1456f0] dark:text-sky-400" />
            <span>展开会话栏 ({conversationsCount})</span>
          </button>
        ) : null}
        {selectedTitle ? (
          <span
            title={selectedTitle}
            className="max-w-[320px] truncate rounded-full border border-border/75 bg-[#fbfdff] px-3 py-1 text-xs font-medium text-[#45515e] dark:bg-card dark:text-muted-foreground"
          >
            {selectedTitle}
          </span>
        ) : null}
      </div>

      <div className="hidden shrink-0 items-center gap-2 lg:flex">
        <StudioStatsPopover variant="toolbar-pill" align="end" side="bottom" />
      </div>
    </div>
  );
}
