import type { CSSProperties, ReactNode, RefObject } from "react";
import { History, Plus, Trash2 } from "lucide-react";

import { ImageSidebar } from "@/app/image/components/image-sidebar";
import { Button } from "@/components/ui/button";
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
  return (
    <section className="mx-auto grid h-[calc(100dvh-6.25rem)] min-h-0 w-full max-w-[1380px] grid-cols-1 gap-2 px-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:h-[calc(100dvh-5rem)] sm:gap-3 sm:px-3 sm:pb-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="hidden h-full min-h-0 border-r border-[#f2f3f5] pr-3 lg:block">
        <ImageSidebar
          conversations={conversations}
          isLoadingHistory={isLoadingHistory}
          selectedConversationId={selectedConversationId}
          onCreateDraft={onCreateDraft}
          onClearHistory={onClearHistory}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          formatConversationTime={formatConversationTime}
        />
      </div>

      {overlays}

      <div className="relative flex min-h-0 flex-col gap-2 sm:gap-4">
        <MobileToolbar
          conversationsCount={conversations.length}
          onOpenHistory={onOpenHistory}
          onCreateDraft={onCreateDraft}
          onClearHistory={onClearHistory}
        />

        <div
          ref={resultsViewportRef}
          className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pt-2 pb-[14rem] sm:px-4 sm:pt-4 sm:pb-[15rem]"
          style={composerDockHeight > 0 ? { paddingBottom: composerDockHeight + 24 } : undefined}
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
          <div className="pointer-events-auto mx-auto w-full max-w-[900px]">{composer}</div>
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
  return (
    <div className="flex items-center justify-between gap-2 px-1 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <Button
          variant="outline"
          className="h-10 min-w-0 flex-1 shrink rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-sm"
          onClick={onOpenHistory}
        >
          <History className="size-4" />
          <span className="truncate">历史记录 ({conversationsCount})</span>
        </Button>
        <Button className="h-10 rounded-full shadow-sm" onClick={onCreateDraft}>
          <Plus className="size-4" />
          新建
        </Button>
        <Button
          variant="outline"
          aria-label="清空历史记录"
          title="清空历史记录"
          className="h-10 rounded-full border-[#e5e7eb] bg-white px-3 text-[#45515e] shadow-sm"
          onClick={() => void onClearHistory()}
          disabled={conversationsCount === 0}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
