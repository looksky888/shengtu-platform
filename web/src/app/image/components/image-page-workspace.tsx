"use client";

import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Clock3, Film, Image as ImageIcon, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { ImageConversationScrollRail } from "@/app/image/components/image-conversation-scroll-rail";
import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { AUTH_SESSION_CHANGE_EVENT, getCachedAuthSession } from "@/lib/session";
import { canAccessPath } from "@/store/auth";
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
  onRenameConversation: (id: string, title: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  overlays: ReactNode;
  results: ReactNode;
  composer: ReactNode;
};

export function ImagePageWorkspace({
  conversations,
  selectedConversationId,
  resultsViewportRef,
  composerDockRef,
  composerDockHeight,
  onCreateDraft,
  onOpenHistory,
  overlays,
  results,
  composer,
}: ImagePageWorkspaceProps) {
  const [session, setSession] = useState(() => getCachedAuthSession());
  useEffect(() => {
    const sync = () => setSession(getCachedAuthSession());
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
  }, []);
  const canSwitchToVideo = Boolean(session && canAccessPath(session, "/video"));

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  const turnsCount = selectedConversation?.turns.length ?? 0;

  return (
    <section className="studio-canvas-dots relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-stage">
      {overlays}

      {/* Sleek Floating Studio Header */}
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-2.5 pb-1.5 sm:px-5 sm:pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <div
            role="tablist"
            aria-label="创作模态切换"
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-border/70 bg-surface/90 p-0.5 text-xs shadow-2xs backdrop-blur-md dark:border-white/[0.08] dark:bg-[#17181c]/95"
          >
            <span
              role="tab"
              aria-selected={true}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 font-semibold text-background shadow-2xs"
            >
              <ImageIcon className="size-3.5" />
              <span>图片创作</span>
            </span>
            {canSwitchToVideo ? (
              <Link
                to="/video"
                role="tab"
                aria-selected={false}
                onMouseEnter={() => preloadRoute("/video")}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Film className="size-3.5" />
                <span>视频创作</span>
              </Link>
            ) : null}
          </div>

          {turnsCount > 0 && selectedConversation?.title ? (
            <span
              title={selectedConversation.title}
              className="hidden max-w-[240px] truncate rounded-full border border-border/60 bg-surface/80 px-2.5 py-1 text-xs font-medium text-muted-foreground md:inline-block"
            >
              {selectedConversation.title}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StudioStatsPopover variant="toolbar-pill" align="end" side="bottom" />

          <button
            type="button"
            onClick={onCreateDraft}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border/70 bg-surface/90 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-hover dark:border-white/[0.08] dark:bg-[#17181c]"
          >
            <Plus className="size-3.5" />
            <span>新建创作</span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface/90 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-hover dark:border-white/[0.08] dark:bg-[#17181c]"
            title="打开右侧历史会话抽屉"
          >
            <Clock3 className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">历史会话</span>
            <span className="font-mono text-[11px] font-semibold text-muted-foreground tabular-nums">
              ({conversations.length})
            </span>
          </button>
        </div>
      </header>

      {turnsCount === 0 ? (
        /* Empty-State Centered Darkroom Hero + Centered Composer + Inspiration Plates */
        <div
          ref={resultsViewportRef}
          className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-8 sm:px-6 sm:pt-8"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col items-center justify-center py-2 sm:py-6">
            <div className="mx-auto flex max-w-[680px] flex-col items-center text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[30px] sm:leading-[1.22]">
                把脑海中的一闪灵感，凝结为
                <span className="text-sky-400">光影杰作</span>
              </h1>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-[13px]">
                支持多模态参考图融合、局部蒙版重绘与高分出图，Enter 立即生成
              </p>
            </div>

            <div
              ref={composerDockRef}
              className="mx-auto mt-6 w-full max-w-[820px]"
            >
              {composer}
            </div>

            <div className="mx-auto mt-6 w-full max-w-[960px]">{results}</div>
          </div>
        </div>
      ) : (
        /* Active-Thread Scrollable Viewport + Bottom Docked Composer */
        <>
          <div className="relative flex min-h-0 flex-1">
            <div
              ref={resultsViewportRef}
              className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pt-2 pr-7 pb-[14rem] sm:px-6 sm:pt-3 sm:pr-9 sm:pb-[15rem]"
              style={
                composerDockHeight > 0
                  ? { paddingBottom: composerDockHeight + 28 }
                  : undefined
              }
            >
              {results}
            </div>

            <ImageConversationScrollRail
              viewportRef={resultsViewportRef}
              turnsCount={turnsCount}
              selectedConversationId={selectedConversationId}
            />
          </div>

          <div
            ref={composerDockRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background via-background/85 to-transparent px-3 pt-4 pb-2.5 sm:px-6 sm:pb-3.5"
            style={
              {
                "--image-composer-dock-height": `${composerDockHeight}px`,
              } as CSSProperties
            }
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[820px]">
              {composer}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
