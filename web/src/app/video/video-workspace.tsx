"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  Image as ImageIcon,
  Layers,
  MonitorPlay,
  Plus,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { ImageConversationScrollRail } from "@/app/image/components/image-conversation-scroll-rail";
import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { VideoComposer } from "@/app/video/video-composer";
import { selectedVideoSize } from "@/app/video/video-options";
import { VideoEmptyShowcase, VideoShotCard } from "@/app/video/video-shot-card";
import { VideoSidebar } from "@/app/video/video-sidebar";
import { buildUnifiedVideoTakes, type RecentVideoTake } from "@/app/video/video-task-storage";
import type { VideoCreationController } from "@/app/video/use-video-creation";
import { Button } from "@/components/ui/button";
import { AUTH_SESSION_CHANGE_EVENT, getCachedAuthSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { canAccessPath } from "@/store/auth";

export function VideoWorkspace({ controller }: { controller: VideoCreationController }) {
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [composerDockHeight, setComposerDockHeight] = useState(160);
  const [cachedSession, setCachedSession] = useState(() => getCachedAuthSession());

  useEffect(() => {
    const sync = () => setCachedSession(getCachedAuthSession());
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, sync);
  }, []);

  const effectiveSession = controller.session ?? cachedSession;
  const canSwitchToImage = Boolean(
    effectiveSession && canAccessPath(effectiveSession, "/image"),
  );

  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const initialScrolledRef = useRef(false);

  const unifiedNewestFirst = useMemo<RecentVideoTake[]>(
    () =>
      buildUnifiedVideoTakes(
        controller.recentTakes,
        controller.task,
        controller.submittedMeta,
        controller.video?.url,
      ),
    [
      controller.recentTakes,
      controller.submittedMeta,
      controller.task,
      controller.video?.url,
    ],
  );

  const chronologicalShots = useMemo(
    () => [...unifiedNewestFirst].reverse(),
    [unifiedNewestFirst],
  );
  const isEmptyStage = chronologicalShots.length === 0;

  // Measure floating composer dock height so scrollable viewport never hides content behind dock
  useEffect(() => {
    const dockNode = composerDockRef.current;
    if (!dockNode || typeof ResizeObserver === "undefined") return;
    const syncHeight = () => {
      const measured = Math.round(dockNode.getBoundingClientRect().height);
      if (measured > 0) {
        setComposerDockHeight(measured);
      }
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(dockNode);
    return () => observer.disconnect();
  }, [isEmptyStage]);

  const monitorShotInfo = useMemo(() => {
    if (chronologicalShots.length === 0) return null;
    const targetId =
      controller.selectedTakeId ||
      controller.task?.id ||
      chronologicalShots[chronologicalShots.length - 1]?.taskId;
    const idx = chronologicalShots.findIndex((item) => item.taskId === targetId);
    const resolvedIdx = idx >= 0 ? idx : chronologicalShots.length - 1;
    return {
      take: chronologicalShots[resolvedIdx],
      order: resolvedIdx + 1,
      index: resolvedIdx,
      total: chronologicalShots.length,
    };
  }, [chronologicalShots, controller.selectedTakeId, controller.task?.id]);

  useEffect(() => {
    if (initialScrolledRef.current || chronologicalShots.length === 0) return;
    if (controller.viewMode !== "stream") return;
    const viewport = resultsViewportRef.current;
    if (!viewport) return;
    initialScrolledRef.current = true;
    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [chronologicalShots.length, controller.viewMode]);

  useEffect(() => {
    if (!controller.lastSubmittedTaskId) return;
    const viewport = resultsViewportRef.current;
    if (!viewport) return;
    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [controller.lastSubmittedTaskId]);

  const handleSelectSidebarTake = (take: RecentVideoTake) => {
    controller.selectRecentTake(take.taskId);
    setHistoryDrawerOpen(false);
    if (controller.viewMode === "stream") {
      window.requestAnimationFrame(() => {
        const viewport = resultsViewportRef.current;
        if (!viewport) return;
        const target = Array.from(
          viewport.querySelectorAll<HTMLElement>("[data-take-id]"),
        ).find((node) => node.dataset.takeId === take.taskId);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  const activeSizeSpec = selectedVideoSize(controller.size);
  const liveActive =
    controller.task?.status === "queued" || controller.task?.status === "running";
  const scrollRailTurnsCount =
    controller.viewMode === "stream"
      ? chronologicalShots.length
      : monitorShotInfo
        ? 1
        : 0;

  return (
    <section className="studio-canvas-dots relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-stage">
      {/* Right-Hand 360px Slide-Over Shot History Drawer */}
      <DialogPrimitive.Root
        open={historyDrawerOpen}
        onOpenChange={setHistoryDrawerOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby="video-history-drawer-desc"
            className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(92vw,360px)] flex-col overflow-hidden border-l border-border/75 bg-surface text-foreground shadow-2xl duration-200 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-[360px] dark:bg-[#141519]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border/65 px-4 py-3.5">
              <DialogPrimitive.Title className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <Clock3 className="size-4 text-muted-foreground" />
                <span>历史创作镜头</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                  {unifiedNewestFirst.length}
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                id="video-history-drawer-desc"
                className="sr-only"
              >
                浏览、切换或回填历史生成的视频镜头
              </DialogPrimitive.Description>
              <DialogPrimitive.Close
                aria-label="关闭历史镜头抽屉"
                className="inline-flex size-7.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-2.5 pb-4">
              <VideoSidebar
                takes={unifiedNewestFirst}
                isLoadingHistory={controller.isLoadingHistory}
                selectedTakeId={controller.selectedTakeId}
                activeLiveTaskId={controller.task?.id || ""}
                onStartNewShot={() => {
                  setHistoryDrawerOpen(false);
                  controller.startNewShot();
                }}
                onSelectTake={handleSelectSidebarTake}
                onApplyTakePrompt={(take) => {
                  setHistoryDrawerOpen(false);
                  controller.applyRecentTakePrompt(take);
                }}
                onRemoveTake={controller.removeTake}
                onClearHistory={controller.clearHistoryTakes}
                embeddedInDialog
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Top Studio Switcher Header Bar */}
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-2.5 pb-1.5 sm:px-5 sm:pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="创作模态切换"
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-border/70 bg-surface/90 p-0.5 text-xs shadow-2xs backdrop-blur-md dark:border-white/[0.08] dark:bg-[#17181c]/95"
          >
            {canSwitchToImage ? (
              <Link
                to="/image"
                role="tab"
                aria-selected={false}
                onMouseEnter={() => preloadRoute("/image")}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ImageIcon className="size-3.5" />
                <span>图片创作</span>
              </Link>
            ) : null}
            <span
              role="tab"
              aria-selected={true}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 font-semibold text-background shadow-2xs"
            >
              <Film className="size-3.5" />
              <span>视频创作</span>
            </span>
          </div>

          {chronologicalShots.length > 0 ? (
            <div
              role="tablist"
              aria-label="舞台视图模式"
              className="inline-flex h-8 items-center rounded-full border border-border/70 bg-surface/90 p-0.5 shadow-2xs backdrop-blur-xs dark:border-white/[0.08] dark:bg-[#17181c]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={controller.viewMode === "stream"}
                onClick={() => controller.setViewMode("stream")}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs transition-all",
                  controller.viewMode === "stream"
                    ? "bg-surface-muted font-semibold text-foreground shadow-2xs dark:bg-white/[0.12]"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Layers className="size-3.5" />
                <span>分镜流</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={controller.viewMode === "stage"}
                onClick={() => controller.setViewMode("stage")}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs transition-all",
                  controller.viewMode === "stage"
                    ? "bg-surface-muted font-semibold text-foreground shadow-2xs dark:bg-white/[0.12]"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <MonitorPlay className="size-3.5" />
                <span>专注监看</span>
              </button>
            </div>
          ) : null}

          {liveActive ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-border/75 bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs sm:inline-flex dark:border-white/[0.08] dark:bg-[#17181c]">
              <span className="size-1.5 animate-pulse rounded-full bg-status-success" />
              <span>Grok 正在渲染镜头…</span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StudioStatsPopover variant="toolbar-pill" align="end" side="bottom" />

          <button
            type="button"
            onClick={controller.startNewShot}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border/70 bg-surface/90 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-hover dark:border-white/[0.08] dark:bg-[#17181c]"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">新建镜头</span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryDrawerOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface/90 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-hover dark:border-white/[0.08] dark:bg-[#17181c]"
            title="打开右侧历史镜头抽屉"
          >
            <Clock3 className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">历史镜头</span>
            <span className="font-mono text-[11px] font-semibold text-muted-foreground tabular-nums">
              ({unifiedNewestFirst.length})
            </span>
          </button>
        </div>
      </header>

      {isEmptyStage ? (
        /* Empty-State Centered Darkroom Hero + Centered Composer + Storyboard Plates */
        <div
          ref={resultsViewportRef}
          className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4 pb-8 sm:px-6 sm:pt-8"
        >
          <div className="my-auto mx-auto flex w-full max-w-[1040px] flex-col items-center justify-center py-2 sm:py-6">
            <div className="mx-auto flex max-w-[680px] flex-col items-center text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[30px] sm:leading-[1.22]">
                输入画面描述或拖入首帧参考图，生成
                <span className="text-sky-400">动态镜头</span>
              </h1>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-[13px]">
                支持文生视频、首帧图生与最多 7 张多图角色一致性参考，Enter 立即生成
              </p>
            </div>

            <div
              ref={composerDockRef}
              className="mx-auto mt-6 w-full max-w-[820px]"
            >
              <VideoComposer controller={controller} />
            </div>

            <div className="mx-auto mt-6 w-full max-w-[960px]">
              <VideoEmptyShowcase
                frameRatio={activeSizeSpec.ratio}
                resolutionLabel={controller.resolutionName.toUpperCase()}
                seconds={controller.seconds}
                onSelectInspiration={controller.applyInspirationCard}
                onSelectCameraChip={controller.appendCameraStyleChip}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Active-Thread Scrollable Viewport + Draggable Right Scroll Rail + Bottom Docked Composer */
        <>
          <div className="relative flex min-h-0 flex-1">
            <div
              ref={resultsViewportRef}
              className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pt-2 pr-7 pb-[15rem] sm:px-6 sm:pt-3 sm:pr-9 sm:pb-[16rem]"
              style={
                composerDockHeight > 0
                  ? { paddingBottom: composerDockHeight + 28 }
                  : undefined
              }
            >
              {controller.viewMode === "stream" ? (
                <div className="space-y-8 py-2">
                  {chronologicalShots.map((take, idx) => {
                    const isNewestCompleted =
                      idx === chronologicalShots.length - 1 &&
                      controller.lastSubmittedTaskId === take.taskId;
                    return (
                      <VideoShotCard
                        key={take.taskId}
                        take={take}
                        shotOrder={idx + 1}
                        isHighlighted={controller.selectedTakeId === take.taskId}
                        autoPlay={isNewestCompleted}
                        liveTask={controller.task}
                        liveVideoUrl={controller.video?.url}
                        pollError={controller.pollError}
                        controller={controller}
                      />
                    );
                  })}
                </div>
              ) : monitorShotInfo ? (
                <div className="space-y-3 py-1">
                  {monitorShotInfo.total > 1 ? (
                    <div className="mx-auto flex max-w-[760px] items-center justify-between gap-2 px-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="rounded-lg bg-surface/90"
                        disabled={monitorShotInfo.index <= 0}
                        onClick={() => {
                          const prev = chronologicalShots[monitorShotInfo.index - 1];
                          if (prev) controller.selectRecentTake(prev.taskId);
                        }}
                      >
                        <ChevronLeft className="size-3.5" />
                        <span>上一镜</span>
                      </Button>
                      <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
                        专注监看 · 第 {monitorShotInfo.order} / {monitorShotInfo.total} 镜
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="rounded-lg bg-surface/90"
                        disabled={monitorShotInfo.index >= monitorShotInfo.total - 1}
                        onClick={() => {
                          const next = chronologicalShots[monitorShotInfo.index + 1];
                          if (next) controller.selectRecentTake(next.taskId);
                        }}
                      >
                        <span>下一镜</span>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}

                  <VideoShotCard
                    take={monitorShotInfo.take}
                    shotOrder={monitorShotInfo.order}
                    autoPlay
                    liveTask={controller.task}
                    liveVideoUrl={controller.video?.url}
                    pollError={controller.pollError}
                    controller={controller}
                  />
                </div>
              ) : null}
            </div>

            <ImageConversationScrollRail
              viewportRef={resultsViewportRef}
              turnsCount={scrollRailTurnsCount}
              selectedConversationId={`${controller.viewMode}:${monitorShotInfo?.take.taskId || ""}`}
              unitLabel="镜"
              ariaLabel="视频分镜滚动进度条"
            />
          </div>

          <div
            ref={composerDockRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background via-background/85 to-transparent px-3 pt-4 pb-2.5 sm:px-6 sm:pb-3.5"
            style={
              {
                "--video-composer-dock-height": `${composerDockHeight}px`,
              } as CSSProperties
            }
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[820px]">
              <VideoComposer controller={controller} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
