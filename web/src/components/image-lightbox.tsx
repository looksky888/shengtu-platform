"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { imageDownloadFileName, triggerImageDownload } from "@/lib/image-download";

import { ImageLightboxToolbar } from "./image-lightbox-toolbar";

export type LightboxImage = {
  id: string;
  src: string;
  downloadName?: string;
  sizeLabel?: string;
  dimensions?: string;
};

type ImageLightboxProps = {
  images: LightboxImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function ImageLightbox({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: ImageLightboxProps) {
  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const zoomPercent = Math.round(zoom * 100);

  const resetZoom = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((value) => {
      const next = Math.max(MIN_ZOOM, value - ZOOM_STEP);
      if (next === MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))));
    } else if (event.deltaY > 0) {
      setZoom((value) => {
        const next = Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2)));
        if (next === MIN_ZOOM) {
          setPan({ x: 0, y: 0 });
        }
        return next;
      });
    }
  }, []);

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1);
  }, [hasPrev, currentIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1);
  }, [hasNext, currentIndex, onIndexChange]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goPrev, goNext, resetZoom, zoomIn, zoomOut]);

  useEffect(() => {
    if (open) {
      resetZoom();
    }
  }, [current?.id, open, resetZoom]);

  const handleDownload = useCallback(() => {
    if (!current) return;
    triggerImageDownload(
      current.src,
      current.downloadName || imageDownloadFileName(current.src, current.id)
    );
  }, [current]);

  const handleImagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      event.stopPropagation();
      if (zoom <= MIN_ZOOM) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const handleImagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      setPan({
        x: drag.panX + event.clientX - drag.startX,
        y: drag.panY + event.clientY - drag.startY,
      });
    },
    []
  );

  const handleImagePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    },
    []
  );

  if (!current) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center outline-none"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            图片预览
          </DialogPrimitive.Title>

          <ImageLightboxToolbar
            current={current}
            imageCount={images.length}
            currentIndex={currentIndex}
            zoom={zoom}
            zoomPercent={zoomPercent}
            canZoomIn={zoom < MAX_ZOOM}
            canZoomOut={zoom > MIN_ZOOM}
            canReset={zoom !== MIN_ZOOM || pan.x !== 0 || pan.y !== 0}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            onDownload={handleDownload}
          />

          {hasPrev && (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/95 backdrop-blur-md transition hover:bg-black/70"
              aria-label="上一张"
              title="上一张 (←)"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}

          <div
            className="flex h-full w-full items-center justify-center overflow-hidden p-4 pt-24 sm:p-8 sm:pt-20"
            onClick={() => onOpenChange(false)}
            onWheel={handleWheel}
          >
            <img
              src={current.src}
              alt=""
              className={cn(
                "max-h-[90vh] max-w-[90vw] rounded-lg object-contain transition-transform duration-100",
                zoom > MIN_ZOOM
                  ? "cursor-grab touch-none active:cursor-grabbing"
                  : "cursor-zoom-in"
              )}
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (zoom === MIN_ZOOM) {
                  zoomIn();
                }
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (zoom > MIN_ZOOM) {
                  resetZoom();
                } else {
                  setZoom(2);
                }
              }}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerEnd}
              onPointerCancel={handleImagePointerEnd}
              draggable={false}
            />
          </div>

          {hasNext && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/95 backdrop-blur-md transition hover:bg-black/70"
              aria-label="下一张"
              title="下一张 (→)"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
