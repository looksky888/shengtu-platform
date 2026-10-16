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
      <div className="flex items-center rounded-full bg-black/50 text-white/90">
        <ToolbarButton onClick={onZoomOut} disabled={!canZoomOut} className="rounded-l-full" label={"\u7f29\u5c0f\u56fe\u7247"}>
          <ZoomOut className="size-4" />
        </ToolbarButton>
        <span className="min-w-12 text-center text-xs font-medium tabular-nums">{zoomPercent}%</span>
        <ToolbarButton onClick={onZoomIn} disabled={!canZoomIn} label={"\u653e\u5927\u56fe\u7247"}>
          <ZoomIn className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={onResetZoom} disabled={!canReset} className="rounded-r-full" label={"\u91cd\u7f6e\u7f29\u653e"}>
          <RotateCcw className="size-4" />
        </ToolbarButton>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex size-9 items-center justify-center rounded-full bg-black/50 text-white/90 transition hover:bg-black/70"
        aria-label={"\u4e0b\u8f7d\u56fe\u7247"}
      >
        <Download className="size-4" />
      </button>
      <DialogPrimitive.Close className="inline-flex size-9 items-center justify-center rounded-full bg-black/50 text-white/90 transition hover:bg-black/70">
        <X className="size-4" />
        <span className="sr-only">{"\u5173\u95ed"}</span>
      </DialogPrimitive.Close>
    </div>
  );
}

function ImageMetaBadge({ current, imageCount, currentIndex }: { current: LightboxImage; imageCount: number; currentIndex: number }) {
  return (
    <>
      {current.sizeLabel || current.dimensions ? (
        <span className="max-w-[calc(100vw-2rem)] truncate rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 sm:max-w-[42vw]">
          {[current.sizeLabel, current.dimensions].filter(Boolean).join(" ? ")}
        </span>
      ) : null}
      {imageCount > 1 && (
        <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90">
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
      className={`inline-flex size-9 items-center justify-center transition hover:bg-black/40 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
