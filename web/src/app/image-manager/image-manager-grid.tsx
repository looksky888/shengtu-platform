import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { ImageManagerImageCard } from "@/app/image-manager/image-manager-image-card";
import { IMAGE_MANAGER_SERVER_PAGE_SIZE } from "@/app/image-manager/image-manager-types";
import { managedImageKey } from "@/app/image-manager/image-manager-utils";
import { Button } from "@/components/ui/button";
import type { ImageVisibility, ManagedImage } from "@/lib/api";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

type ImageColumn = Array<{ item: ManagedImage; index: number }>;

type ImageManagerGridProps = {
  filteredCount: number;
  visibleCount: number;
  imageColumns: ImageColumn[];
  galleryView: ImageGalleryView;
  selectedImageIds: Record<string, boolean>;
  focusedImagePath: string | null;
  canDeleteImages: boolean;
  isAdmin: boolean;
  isDeleting: boolean;
  deleteTargetPaths: string[];
  visibilityMutatingPath: string | null;
  currentPage: number;
  canGoPrevPage: boolean;
  canGoNextPage: boolean;
  isPageLoading: boolean;
  serverTotal: number;
  onGoPrevPage: () => void;
  onGoNextPage: () => void;
  onToggleSelection: (item: ManagedImage) => void;
  onFocusPathChange: (path: string | null) => void;
  onOpenLightbox: (index: number) => void;
  onDelete: (items: ManagedImage[]) => void;
  onVisibilityChange: (item: ManagedImage, visibility: ImageVisibility) => void;
};

export function ImageManagerGrid({
  filteredCount,
  visibleCount,
  imageColumns,
  galleryView,
  selectedImageIds,
  focusedImagePath,
  canDeleteImages,
  isAdmin,
  isDeleting,
  deleteTargetPaths,
  visibilityMutatingPath,
  currentPage,
  canGoPrevPage,
  canGoNextPage,
  isPageLoading,
  serverTotal,
  onGoPrevPage,
  onGoNextPage,
  onToggleSelection,
  onFocusPathChange,
  onOpenLightbox,
  onDelete,
  onVisibilityChange,
}: ImageManagerGridProps) {
  const showPager = filteredCount > 0 || currentPage > 1 || canGoNextPage;
  const totalHint =
    serverTotal > 0
      ? `约 ${serverTotal} 张`
      : `每页最多 ${IMAGE_MANAGER_SERVER_PAGE_SIZE} 张`;

  return (
    <>
      {filteredCount > 0 ? (
        <div
          className="grid gap-3 sm:gap-4"
          style={{ gridTemplateColumns: `repeat(${imageColumns.length}, minmax(0, 1fr))` }}
        >
          {imageColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-w-0 flex-col gap-3 sm:gap-4">
              {column.map(({ item, index }) => {
                const imageKey = managedImageKey(item);
                return (
                  <ImageManagerImageCard
                    key={item.url}
                    item={item}
                    index={index}
                    galleryView={galleryView}
                    selected={Boolean(selectedImageIds[imageKey])}
                    focused={focusedImagePath === imageKey}
                    canDeleteImages={canDeleteImages}
                    isAdmin={isAdmin}
                    isDeleting={isDeleting}
                    deleteTargetPaths={deleteTargetPaths}
                    visibilityMutatingPath={visibilityMutatingPath}
                    onToggleSelection={onToggleSelection}
                    onFocusPathChange={onFocusPathChange}
                    onOpenLightbox={onOpenLightbox}
                    onDelete={onDelete}
                    onVisibilityChange={onVisibilityChange}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {showPager ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2 py-1.5 shadow-2xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs"
              disabled={!canGoPrevPage || isPageLoading}
              onClick={onGoPrevPage}
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <span className="min-w-[7.5rem] text-center text-xs text-muted-foreground tabular-nums">
              {isPageLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircle className="size-3.5 animate-spin text-primary" />
                  加载中…
                </span>
              ) : (
                <>
                  第 {currentPage} 页 · 本页 {visibleCount} 张
                </>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs"
              disabled={!canGoNextPage || isPageLoading}
              onClick={onGoNextPage}
            >
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{totalHint} · 每页 {IMAGE_MANAGER_SERVER_PAGE_SIZE} 张</p>
        </div>
      ) : null}
    </>
  );
}
