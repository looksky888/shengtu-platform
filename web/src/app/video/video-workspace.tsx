"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Layers,
  Library,
  MonitorPlay,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ImageConversationScrollRail } from "@/app/image/components/image-conversation-scroll-rail";
import { StudioStatsPopover } from "@/app/image/components/studio-stats-popover";
import { VideoComposer } from "@/app/video/video-composer";
import { selectedVideoSize } from "@/app/video/video-options";
import { VideoEmptyShowcase, VideoShotCard } from "@/app/video/video-shot-card";
import { VideoSidebar } from "@/app/video/video-sidebar";
import { buildUnifiedVideoTakes, type RecentVideoTake } from "@/app/video/video-task-storage";
import type { VideoCreationController } from "@/app/video/use-video-creation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function VideoWorkspace({ controller }: { controller: VideoCreationController }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [composerDockHeight, setComposerDockHeight] = useState(160);

  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const initialScrolledRef = useRef(false);

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
  }, []);

  // Build unified take list (ensuring active live task is always present even before localStorage sync)
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

  // Chronological order for Shot Stream (`第 1 镜` at top -> `第 N 镜` latest at bottom above Composer)
  const chronologicalShots = useMemo(
    () => [...unifiedNewestFirst].reverse(),
    [unifiedNewestFirst],
  );

  // Active shot for Monitor (`stage`) view
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

  // Auto-scroll to latest shot on first load with history
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

  // Auto-scroll to bottom when a new video task is submitted
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
    setMobileHistoryOpen(false);
    if (controller.viewMode === "stream") {
      window.requestAnimationFrame(() => {
        const viewport = resultsViewportRef.current;
        if (!viewport) return;
        const target = Array.from(viewport.querySelectorAll<HTMLElement>("[data-take-id]")).find(
          (node) => node.dataset.takeId === take.taskId,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  const activeSizeSpec = selectedVideoSize(controller.size);
  const liveActive =
    controller.task?.status === "queued" || controller.task?.status === "running";
  const scrollRailTurnsCount =
    controller.viewMode === "stream" ? chronologicalShots.length : monitorShotInfo ? 1 : 0;

  return (
    <section
      className={cn(
        "mx-auto grid h-[calc(100dvh-5rem)] min-h-0 w-full max-w-[1400px] grid-cols-1 gap-2 px-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:h-[calc(100dvh-4.75rem)] sm:gap-3 sm:px-2 sm:pb-4",
        sidebarCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)]"
          : "lg:grid-cols-[248px_minmax(0,1fr)]",
      )}
    >
      {/* Desktop Left Shot History Sidebar */}
      {!sidebarCollapsed ? (
        <div className="hidden h-full min-h-0 rounded-2xl border border-border/80 bg-surface px-2.5 py-2.5 shadow-2xs lg:block">
          <VideoSidebar
            takes={unifiedNewestFirst}
            isLoadingHistory={controller.isLoadingHistory}
            selectedTakeId={controller.selectedTakeId}
            activeLiveTaskId={controller.task?.id || ""}
            onStartNewShot={controller.startNewShot}
            onSelectTake={handleSelectSidebarTake}
            onApplyTakePrompt={controller.applyRecentTakePrompt}
            onRemoveTake={controller.removeTake}
            onClearHistory={controller.clearHistoryTakes}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
      ) : null}

      {/* Mobile History Dialog */}
      <Dialog open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
        <DialogContent className="flex h-[78dvh] max-h-[640px] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-2 overflow-hidden rounded-2xl border-border/80 bg-surface p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>历史创作镜头</DialogTitle>
            <DialogDescription>浏览、切换或回填历史生成的视频镜头</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <VideoSidebar
              takes={unifiedNewestFirst}
              isLoadingHistory={controller.isLoadingHistory}
              selectedTakeId={controller.selectedTakeId}
              activeLiveTaskId={controller.task?.id || ""}
              onStartNewShot={() => {
                setMobileHistoryOpen(false);
                controller.startNewShot();
              }}
              onSelectTake={handleSelectSidebarTake}
              onApplyTakePrompt={(take) => {
                setMobileHistoryOpen(false);
                controller.applyRecentTakePrompt(take);
              }}
              onRemoveTake={controller.removeTake}
              onClearHistory={controller.clearHistoryTakes}
              embeddedInDialog
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Central Theme-Adaptive Studio Canvas Stage (.studio-canvas-dots bg-stage) */}
      <div className="studio-canvas-dots relative flex min-h-0 flex-col gap-1.5 rounded-2xl border border-border/80 bg-stage p-1.5 sm:p-2">
        {/* Lightweight Stage Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-0.5 sm:px-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {sidebarCollapsed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-lg bg-surface/90 shadow-2xs lg:inline-flex"
                onClick={() => setSidebarCollapsed(false)}
                title="展开镜头列表"
              >
                <PanelLeftOpen className="size-4" />
                <span>镜头 ({unifiedNewestFirst.length})</span>
              </Button>
            ) : null}

            {/* Mobile History & New Shot Triggers */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg bg-surface/90 px-2.5 text-xs shadow-2xs lg:hidden"
              onClick={() => setMobileHistoryOpen(true)}
            >
              <History className="size-3.5" />
              <span>镜头 ({unifiedNewestFirst.length})</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-lg bg-primary px-2.5 text-xs text-primary-foreground shadow-2xs hover:bg-primary/90 lg:hidden"
              onClick={controller.startNewShot}
            >
              <Plus className="size-3.5" />
              <span>新建</span>
            </Button>

            {/* View Mode Toggle: Shot Stream vs Focus Monitor */}
            {chronologicalShots.length > 0 ? (
              <div
                role="tablist"
                aria-label="舞台视图模式"
                className="inline-flex h-8 items-center rounded-lg border border-border/75 bg-surface/90 p-0.5 shadow-2xs backdrop-blur-xs"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={controller.viewMode === "stream"}
                  onClick={() => controller.setViewMode("stream")}
                  className={cn(
                    "inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-xs transition-all",
                    controller.viewMode === "stream"
                      ? "bg-surface-muted font-semibold text-foreground shadow-2xs"
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
                    "inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-xs transition-all",
                    controller.viewMode === "stage"
                      ? "bg-surface-muted font-semibold text-foreground shadow-2xs"
                      : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MonitorPlay className="size-3.5" />
                  <span>专注监看</span>
                </button>
              </div>
            ) : null}

            {liveActive ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-border/75 bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs sm:inline-flex">
                <span className="size-1.5 animate-pulse rounded-full bg-status-success" />
                <span>Grok 正在渲染镜头…</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {sidebarCollapsed ? (
              <StudioStatsPopover variant="toolbar-pill" align="end" side="bottom" />
            ) : (
              <div className="lg:hidden">
                <StudioStatsPopover variant="toolbar-pill" align="end" side="bottom" />
              </div>
            )}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-lg bg-surface/90 px-2.5 text-xs shadow-2xs"
            >
              <Link to="/video-library">
                <Library className="size-3.5" />
                <span>视频库</span>
              </Link>
            </Button>
          </div>
        </header>

        {/* Scrollable Stage Viewport + Draggable Right Scroll Rail */}
        <div className="relative flex min-h-0 flex-1">
          <div
            ref={resultsViewportRef}
            className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pt-1 pr-7 pb-[15rem] pl-1 sm:pt-2 sm:pr-9 sm:pb-[16rem] sm:pl-4"
            style={
              composerDockHeight > 0
                ? { paddingBottom: composerDockHeight + 28 }
                : undefined
            }
          >
            {chronologicalShots.length === 0 ? (
              <VideoEmptyShowcase
                frameRatio={activeSizeSpec.ratio}
                resolutionLabel={controller.resolutionName.toUpperCase()}
                seconds={controller.seconds}
                onSelectInspiration={controller.applyInspirationCard}
                onSelectCameraChip={controller.appendCameraStyleChip}
              />
            ) : controller.viewMode === "stream" ? (
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

        {/* Floating Bottom Director Composer Dock */}
        <div
          ref={composerDockRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-1 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] sm:px-4 sm:pb-2.5"
          style={
            {
              "--video-composer-dock-height": `${composerDockHeight}px`,
            } as CSSProperties
          }
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[900px]">
            <VideoComposer controller={controller} />
          </div>
        </div>
      </div>
    </section>
  );
}
