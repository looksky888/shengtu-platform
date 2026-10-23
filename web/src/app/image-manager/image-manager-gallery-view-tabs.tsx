import { Globe2, ImageIcon, LayoutGrid } from "lucide-react";

import { MediaLibraryTabs } from "@/components/media-library-tabs";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

type ImageManagerGalleryViewTabsProps = {
  galleryView: ImageGalleryView;
  isAdmin: boolean;
  /** Items on the current server page (≤100). */
  itemsCount: number;
  filteredCount: number;
  hasLocalFilters: boolean;
  /** Server-side total matching filters; falls back to itemsCount when unknown. */
  serverTotal?: number;
  serverHasMore?: boolean;
  /** 1-based page index for true pagination UI. */
  currentPage?: number;
  onGalleryViewChange: (view: ImageGalleryView) => void;
};

const galleryViewLabel: Record<ImageGalleryView, string> = {
  all: "全部图片",
  mine: "个人图库",
  public: "公开图库",
};

export function ImageManagerGalleryViewTabs({
  galleryView,
  isAdmin,
  itemsCount,
  filteredCount,
  hasLocalFilters,
  serverTotal,
  serverHasMore = false,
  currentPage = 1,
  onGalleryViewChange,
}: ImageManagerGalleryViewTabsProps) {
  const options = [
    ...(isAdmin ? [{ value: "all" as const, label: galleryViewLabel.all, icon: LayoutGrid }] : []),
    { value: "mine" as const, label: galleryViewLabel.mine, icon: ImageIcon },
    { value: "public" as const, label: galleryViewLabel.public, icon: Globe2 },
  ];
  const viewLabel = galleryViewLabel[galleryView] ?? "图库";
  const total = typeof serverTotal === "number" && serverTotal > 0 ? serverTotal : itemsCount;
  const countLabel = hasLocalFilters
    ? `本页显示 ${filteredCount} / ${itemsCount} 张（库内约 ${total} 张）`
    : serverHasMore || currentPage > 1
      ? `共约 ${total} 张 · 第 ${currentPage} 页 · 本页 ${itemsCount} 张`
      : `共 ${total} 张`;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2.5">
      <MediaLibraryTabs value={galleryView} label="图库视图" options={options} onChange={onGalleryViewChange} />
      <div className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-xs text-muted-foreground shadow-2xs tabular-nums">
        <span className="font-medium text-foreground/85">{viewLabel}</span>
        <span className="text-border">·</span>
        <span>{countLabel}</span>
      </div>
    </div>
  );
}
