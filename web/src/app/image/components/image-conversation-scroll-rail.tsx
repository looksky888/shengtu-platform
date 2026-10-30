"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ChevronsDown, ChevronsUp } from "lucide-react";

import {
  clampScrollValue,
  computeScrollRailThumb,
  isViewportOverflowing,
  scrollTopForThumbDrag,
  scrollTopForTrackClick,
} from "@/app/image/lib/image-scroll-rail-math";
import { cn } from "@/lib/utils";

type ImageConversationScrollRailProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  turnsCount: number;
  selectedConversationId: string | null;
  bottomInset?: number;
  unitLabel?: string;
  ariaLabel?: string;
};

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  currentTurn: number;
};

type DragSession = {
  pointerId: number;
  startY: number;
  startScrollTop: number;
  travel: number;
  maxScroll: number;
};

export function ImageConversationScrollRail({
  viewportRef,
  turnsCount,
  selectedConversationId,
  bottomInset = 0,
  unitLabel = "轮",
  ariaLabel = "对话滚动进度条",
}: ImageConversationScrollRailProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const cleanupDragListenersRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    trackHeight: 0,
    currentTurn: 0,
  });

  const syncMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const scrollTop = viewport.scrollTop;
    const scrollHeight = viewport.scrollHeight;
    const clientHeight = viewport.clientHeight;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const ratio = maxScroll > 0 ? clampScrollValue(scrollTop / maxScroll, 0, 1) : 0;
    const measuredTrackHeight = Math.round(trackRef.current?.getBoundingClientRect().height ?? 0);

    let currentTurn = turnsCount > 0 ? turnsCount : 0;
    if (turnsCount > 0) {
      const viewportRect = viewport.getBoundingClientRect();
      const turnNodes = viewport.querySelectorAll<HTMLElement>("[data-turn-order]");
      if (viewportRect.height > 0 && turnNodes.length > 0) {
        const probeY = viewportRect.top + clientHeight * 0.36;
        let bestOrder = Number(turnNodes[0].dataset.turnOrder) || 1;
        for (const node of turnNodes) {
          const order = Number(node.dataset.turnOrder);
          if (!Number.isFinite(order) || order < 1) {
            continue;
          }
          if (node.getBoundingClientRect().top <= probeY) {
            bestOrder = order;
          } else {
            break;
          }
        }
        currentTurn = clampScrollValue(bestOrder, 1, turnsCount);
      } else {
        currentTurn = clampScrollValue(Math.round(ratio * Math.max(0, turnsCount - 1)) + 1, 1, turnsCount);
      }
    }

    setMetrics((prev) => {
      const nextTrackHeight = measuredTrackHeight > 0 ? measuredTrackHeight : prev.trackHeight;
      if (
        Math.abs(prev.scrollTop - scrollTop) < 0.5 &&
        prev.scrollHeight === scrollHeight &&
        prev.clientHeight === clientHeight &&
        prev.trackHeight === nextTrackHeight &&
        prev.currentTurn === currentTurn
      ) {
        return prev;
      }
      return {
        scrollTop,
        scrollHeight,
        clientHeight,
        trackHeight: nextTrackHeight,
        currentTurn,
      };
    });
  }, [turnsCount, viewportRef]);

  const isOverflowing = isViewportOverflowing(metrics.scrollHeight, metrics.clientHeight);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const initialRaf = window.requestAnimationFrame(syncMetrics);
    const handleScroll = () => syncMetrics();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleScroll) : null;
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver?.observe(viewport.firstElementChild);
    }

    const mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            if (viewport.firstElementChild) {
              resizeObserver?.observe(viewport.firstElementChild);
            }
            syncMetrics();
          })
        : null;
    mutationObserver?.observe(viewport, { childList: true, subtree: false });

    return () => {
      window.cancelAnimationFrame(initialRaf);
      viewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [selectedConversationId, syncMetrics, turnsCount, viewportRef]);

  useEffect(() => {
    if (!isOverflowing) {
      return;
    }
    const trackNode = trackRef.current;
    if (!trackNode) {
      return;
    }
    const rafId = window.requestAnimationFrame(syncMetrics);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncMetrics()) : null;
    observer?.observe(trackNode);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [isOverflowing, syncMetrics]);

  const syncMetricsRef = useRef(syncMetrics);
  syncMetricsRef.current = syncMetrics;

  const endDragSession = useCallback(() => {
    const activeSession = dragSessionRef.current;
    dragSessionRef.current = null;
    if (cleanupDragListenersRef.current) {
      const cleanup = cleanupDragListenersRef.current;
      cleanupDragListenersRef.current = null;
      cleanup();
    }
    if (activeSession) {
      const trackNode = trackRef.current;
      if (trackNode && typeof trackNode.releasePointerCapture === "function") {
        try {
          if (
            typeof trackNode.hasPointerCapture !== "function" ||
            trackNode.hasPointerCapture(activeSession.pointerId)
          ) {
            trackNode.releasePointerCapture(activeSession.pointerId);
          }
        } catch {
          // Ignore already-released pointer captures
        }
      }
    }
    setIsDragging(false);
  }, []);

  useEffect(() => () => endDragSession(), [endDragSession]);

  if (!isOverflowing) {
    return null;
  }

  const { maxScroll, effectiveTrackHeight, percent, thumbHeight, thumbTop } =
    computeScrollRailThumb(metrics);

  const atTop = metrics.scrollTop <= 4;
  const atBottom = maxScroll - metrics.scrollTop <= 4;

  const startDragSession = (
    event: ReactPointerEvent<HTMLDivElement>,
    mode: "thumb" | "track",
  ) => {
    const viewport = viewportRef.current;
    const trackNode = trackRef.current;
    if (!viewport || !trackNode) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = trackNode.getBoundingClientRect();
    const liveTrackHeight = rect.height > 0 ? rect.height : effectiveTrackHeight;
    const liveThumb = computeScrollRailThumb({
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      trackHeight: liveTrackHeight,
    });

    let startScrollTop = viewport.scrollTop;
    if (mode === "track") {
      startScrollTop = scrollTopForTrackClick({
        clickOffsetY: event.clientY - rect.top,
        thumbHeight: liveThumb.thumbHeight,
        travel: liveThumb.travel,
        maxScroll: liveThumb.maxScroll,
      });
      viewport.scrollTop = startScrollTop;
      syncMetrics();
    }

    endDragSession();

    const pointerId = event.pointerId;
    dragSessionRef.current = {
      pointerId,
      startY: event.clientY,
      startScrollTop,
      travel: liveThumb.travel,
      maxScroll: liveThumb.maxScroll,
    };
    setIsDragging(true);

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      const liveViewport = viewportRef.current;
      if (!session || !liveViewport || moveEvent.pointerId !== session.pointerId) {
        return;
      }
      if (moveEvent.pointerType === "mouse" && (moveEvent.buttons & 1) === 0) {
        endDragSession();
        return;
      }
      moveEvent.preventDefault();
      const deltaY = moveEvent.clientY - session.startY;
      const nextScrollTop = scrollTopForThumbDrag({
        startScrollTop: session.startScrollTop,
        deltaY,
        travel: session.travel,
        maxScroll: session.maxScroll,
      });
      liveViewport.scrollTop = nextScrollTop;
      syncMetricsRef.current();
    };

    const handlePointerFinish = (finishEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || finishEvent.pointerId !== session.pointerId) {
        return;
      }
      endDragSession();
    };

    const handleWindowBlur = () => {
      endDragSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        endDragSession();
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    trackNode.addEventListener("lostpointercapture", handlePointerFinish);

    cleanupDragListenersRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      trackNode.removeEventListener("lostpointercapture", handlePointerFinish);
    };

    if (typeof trackNode.setPointerCapture === "function") {
      try {
        trackNode.setPointerCapture(pointerId);
      } catch {
        // Ignore synthetic events without active pointer registration
      }
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const step = Math.max(80, Math.round(viewport.clientHeight * 0.15));
    const pageStep = Math.max(200, Math.round(viewport.clientHeight * 0.85));
    let nextTop: number | null = null;
    switch (event.key) {
      case "ArrowUp":
        nextTop = clampScrollValue(viewport.scrollTop - step, 0, maxScroll);
        break;
      case "ArrowDown":
        nextTop = clampScrollValue(viewport.scrollTop + step, 0, maxScroll);
        break;
      case "PageUp":
        nextTop = clampScrollValue(viewport.scrollTop - pageStep, 0, maxScroll);
        break;
      case "PageDown":
        nextTop = clampScrollValue(viewport.scrollTop + pageStep, 0, maxScroll);
        break;
      case "Home":
        nextTop = 0;
        break;
      case "End":
        nextTop = maxScroll;
        break;
      default:
        return;
    }
    event.preventDefault();
    viewport.scrollTop = nextTop;
    syncMetrics();
  };

  const jumpToEdge = (edge: "top" | "bottom") => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTo({
      top: edge === "top" ? 0 : viewport.scrollHeight,
      behavior: "smooth",
    });
  };

  const showFloatingHud = isDragging || isHovered;
  const hudCenterY = clampScrollValue(thumbTop + thumbHeight / 2, 16, Math.max(16, effectiveTrackHeight - 16));

  return (
    <div
      data-testid="conversation-scroll-rail"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={bottomInset > 0 ? { bottom: Math.max(12, bottomInset) } : undefined}
      className="group/rail absolute top-2 right-0.5 bottom-3 z-40 flex flex-col items-center gap-1 select-none sm:top-3 sm:right-1.5 sm:bottom-4"
    >
      <button
        type="button"
        aria-label="滚动到顶部"
        title={`回到第一${unitLabel}（顶部）`}
        disabled={atTop}
        onClick={() => jumpToEdge("top")}
        className="inline-flex size-6 items-center justify-center rounded-full border border-border/75 bg-surface/90 text-muted-foreground shadow-2xs backdrop-blur-sm transition-all hover:border-border-strong hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronsUp className="size-3.5" />
      </button>

      <div
        ref={trackRef}
        data-testid="conversation-scroll-track"
        role="scrollbar"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => startDragSession(event, "track")}
        className="relative flex min-h-0 w-6 flex-1 cursor-pointer touch-none justify-center py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:rounded-full"
      >
        {/* Floating live round & percentage HUD */}
        {showFloatingHud ? (
          <div
            data-testid="conversation-scroll-hud"
            style={{ top: hudCenterY }}
            className="pointer-events-none absolute right-7 -translate-y-1/2 rounded-lg border border-border/85 bg-surface/95 px-2.5 py-1 font-mono text-[11px] font-semibold whitespace-nowrap text-foreground tabular-nums shadow-md backdrop-blur-md"
          >
            {turnsCount > 0 ? `第 ${metrics.currentTurn} / ${turnsCount} ${unitLabel} · ${percent}%` : `${percent}%`}
          </div>
        ) : null}

        {/* Visible vertical track + progress fill */}
        <div
          className={cn(
            "relative h-full rounded-full bg-foreground/[0.09] ring-1 ring-inset ring-black/[0.05] transition-all duration-150 dark:bg-white/[0.11] dark:ring-white/[0.08]",
            isDragging ? "w-2.5 bg-foreground/[0.15]" : "w-2 group-hover/rail:w-2.5 group-hover/rail:bg-foreground/[0.13]",
          )}
        >
          <div
            aria-hidden="true"
            style={{ height: Math.min(effectiveTrackHeight, thumbTop + thumbHeight / 2) }}
            className="w-full rounded-full bg-foreground/[0.14] dark:bg-white/[0.16]"
          />
        </div>

        {/* Draggable thumb */}
        <div
          data-testid="conversation-scroll-thumb"
          onPointerDown={(event) => startDragSession(event, "thumb")}
          style={{
            height: thumbHeight,
            transform: `translateY(${thumbTop}px)`,
          }}
          title="按住上下拖动快速浏览历史对话"
          className={cn(
            "absolute top-0 left-1/2 flex -translate-x-1/2 cursor-grab items-center justify-center rounded-full shadow-xs ring-1 ring-background/60 transition-[width,background-color,box-shadow] duration-150 active:cursor-grabbing",
            isDragging
              ? "w-3.5 bg-foreground shadow-sm"
              : "w-2.5 bg-foreground/55 group-hover/rail:w-3.5 group-hover/rail:bg-foreground/80",
          )}
        >
          <span
            aria-hidden="true"
            className="flex flex-col gap-[2px] opacity-70"
          >
            <span className="h-[1.5px] w-1.5 rounded-full bg-background" />
            <span className="h-[1.5px] w-1.5 rounded-full bg-background" />
            <span className="h-[1.5px] w-1.5 rounded-full bg-background" />
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-label="滚动到底部"
        title={`跳到最新一${unitLabel}（底部）`}
        disabled={atBottom}
        onClick={() => jumpToEdge("bottom")}
        className="inline-flex size-6 items-center justify-center rounded-full border border-border/75 bg-surface/90 text-muted-foreground shadow-2xs backdrop-blur-sm transition-all hover:border-border-strong hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronsDown className="size-3.5" />
      </button>
    </div>
  );
}
