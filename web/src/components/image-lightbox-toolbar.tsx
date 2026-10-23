import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";

import type { LightboxImage } from "./image-lightbox";

type ImageLightboxToolbarProps = {
  current: LightboxImage;
  imageCount: number;
  currentIndex: number;
  zoom: number;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canReset: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onDownload: () => void;
};

export function ImageLightboxToolbar({
  current,
  imageCount,
  currentIndex,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  canReset,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onDownload,
}: ImageLightboxToolbarProps) {
  return (
    <div className="absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center justify-end gap-2 sm:top-4 sm:right-4 sm:left-auto">
      <ImageMetaBadge current={current} imageCount={imageCount} currentIndex={currentIndex} />
      <div className="flex items-center rounded-full border border-zinc-700/70 bg-zinc-950/75 text-zinc-100 shadow-lg backdrop-blur-md">
        <ToolbarButton onClick={onZoomOut} disabled={!canZoomOut} className="rounded-l-full" label="缩小图片">
          <ZoomOut className="size-4" />
        </ToolbarButton>
        <span className="min-w-12 text-center font-mono text-xs font-medium tabular-nums">{zoomPercent}%</span>
        <ToolbarButton onClick={onZoomIn} disabled={!canZoomIn} label="放大图片">
          <ZoomIn className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={onResetZoom} disabled={!canReset} className="rounded-r-full" label="重置缩放">
          <RotateCcw className="size-4" />
        </ToolbarButton>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-950/75 text-zinc-100 shadow-lg backdrop-blur-md transition hover:bg-zinc-900"
        aria-label="下载图片"
        title="下载图片"
      >
        <Download className="size-4" />
      </button>
      <DialogPrimitive.Close
        className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-700/70 bg-zinc-950/75 text-zinc-100 shadow-lg backdrop-blur-md transition hover:bg-zinc-900"
        title="关闭预览 (Esc)"
      >
        <X className="size-4" />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </div>
  );
}

function ImageMetaBadge({
  current,
  imageCount,
  currentIndex,
}: {
  current: LightboxImage;
  imageCount: number;
  currentIndex: number;
}) {
  return (
    <>
      {current.sizeLabel || current.dimensions ? (
        <span className="max-w-[calc(100vw-2rem)] truncate rounded-full border border-zinc-700/70 bg-zinc-950/75 px-3 py-1.5 font-mono text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md sm:max-w-[42vw]">
          {[current.dimensions, current.sizeLabel].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {imageCount > 1 && (
        <span className="rounded-full border border-zinc-700/70 bg-zinc-950/75 px-3 py-1.5 font-mono text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md tabular-nums">
          {currentIndex + 1} / {imageCount}
        </span>
      )}
    </>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  className = "",
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex size-9 items-center justify-center transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
