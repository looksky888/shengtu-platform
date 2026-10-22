"use client";

import { useCallback, useEffect } from "react";

import { ImageManagerActionsPopover } from "@/app/image-manager/image-manager-actions-popover";
import { ImageManagerAutoRefreshControls } from "@/app/image-manager/image-manager-auto-refresh-controls";
import { ImageManagerDeleteDialog } from "@/app/image-manager/image-manager-delete-dialog";
import { ImageManagerFilterPanel } from "@/app/image-manager/image-manager-filter-panel";
import { ImageManagerGalleryViewTabs } from "@/app/image-manager/image-manager-gallery-view-tabs";
import { ImageManagerGrid } from "@/app/image-manager/image-manager-grid";
import { ImageManagerStatusSections } from "@/app/image-manager/image-manager-status-sections";
import {
  getImageManagerStatus,
  type ImageManagerContentProps,
  useImageManagerInitialItems,
  useImageManagerLightboxImages,
  useImageManagerViewState,
} from "@/app/image-manager/use-image-manager-content-state";
import { useImageManagerFilters } from "@/app/image-manager/use-image-manager-filters";
import { useImageManagerLoader } from "@/app/image-manager/use-image-manager-loader";
import { useOrderedImageMasonryColumns } from "@/app/image-manager/use-image-masonry-columns";
import { useImageManagerMutations } from "@/app/image-manager/use-image-manager-mutations";
import { useImageManagerSelection } from "@/app/image-manager/use-image-manager-selection";
import { ImageLightbox } from "@/components/image-lightbox";
import { MediaAssetTypeSwitcher } from "@/components/media-library-tabs";
import { PageHeader } from "@/components/page-header";
import { imageManagerCacheKey } from "@/lib/image-manager-cache";

export function ImageManagerContent({ cacheScope, canDeleteImages, isAdmin }: ImageManagerContentProps) {
  const { initialGalleryView, initialCache, items, setItems } = useImageManagerInitialItems(cacheScope, isAdmin);
  const view = useImageManagerViewState();

  const filters = useImageManagerFilters(items, initialGalleryView);
  const { galleryView, setGalleryView } = filters;

  // Harden: never keep "all" selected for non-admin (UI + request scope).
  useEffect(() => {
    if (!isAdmin && galleryView === "all") {
      setGalleryView("mine");
    }
  }, [galleryView, setGalleryView, isAdmin]);
  const currentCacheKey = imageManagerCacheKey(cacheScope, filters.galleryView, filters.startDate, filters.endDate);
  const selection = useImageManagerSelection(filters.filteredItems);
  const { resetSelection } = selection;
  const mutations = useImageManagerMutations({
    items,
    setItems,
    currentCacheKey,
    galleryView: filters.galleryView,
    canDeleteImages,
    removeSelectedPaths: selection.removeSelectedPaths,
    closeLightbox: view.closeLightbox,
  });
  const loader = useImageManagerLoader({
    currentCacheKey,
    galleryView: filters.galleryView,
    startDate: filters.startDate,
    endDate: filters.endDate,
    items,
    setItems,
    hasInitialCache: Boolean(initialCache),
    isMutatingImages: mutations.isMutatingImages,
    resetSelection,
  });
  const { clearLoadError } = loader;

  const resetListState = useCallback(() => {
    resetSelection();
    clearLoadError();
  }, [clearLoadError, resetSelection]);
  const imageColumns = useOrderedImageMasonryColumns(filters.filteredItems);
  const lightboxImages = useImageManagerLightboxImages(filters.filteredItems);
  const status = getImageManagerStatus(loader.isLoading, loader.loadError, items.length, filters.filteredItems.length);

  return (
    <section className="flex flex-col gap-4 pb-20 sm:pb-24">
      <PageHeader
        eyebrow="资产与媒体"
        title="素材中心"
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <MediaAssetTypeSwitcher current="image" />
            <ImageManagerGalleryViewTabs
              galleryView={filters.galleryView}
              isAdmin={isAdmin}
              itemsCount={items.length}
              filteredCount={filters.filteredItems.length}
              hasLocalFilters={filters.hasLocalFilters}
              serverTotal={loader.serverTotal}
              serverHasMore={loader.serverHasMore}
              currentPage={loader.currentPage}
              onGalleryViewChange={(nextView) => {
                if (!isAdmin && nextView === "all") return;
                if (nextView !== filters.galleryView) {
                  filters.setGalleryView(nextView);
                  resetListState();
                }
              }}
            />
          </div>
        }
        actions={
          <>
            <ImageManagerAutoRefreshControls
              menuScope="desktop"
              className="hidden items-center gap-2 md:flex"
              activeScope={view.autoRefreshMenuScope}
              buttonLabel={loader.autoRefreshButtonLabel}
              isAutoRefreshing={loader.isAutoRefreshing}
              isAutoRefreshEnabled={loader.isAutoRefreshEnabled}
              autoRefreshInterval={loader.autoRefreshInterval}
              isLoading={loader.isLoading}
              isMutatingImages={mutations.isMutatingImages}
              onScopeChange={view.setAutoRefreshMenuScope}
              onToggleAutoRefresh={loader.toggleAutoRefresh}
              onIntervalChange={(interval) => {
                loader.updateAutoRefreshInterval(interval);
                view.setAutoRefreshMenuScope(null);
              }}
              onRefresh={() => void loader.loadImages({ force: true })}
            />
            <ImageManagerActionsPopover
              open={view.isImageActionsOpen}
              selectedCount={selection.selectedCount}
              totalCount={items.length}
              filteredCount={filters.filteredItems.length}
              hasLocalFilters={filters.hasLocalFilters}
              allSelected={selection.allSelected}
              galleryView={filters.galleryView}
              selectedItems={selection.selectedItems}
              selectedPrivateItems={selection.selectedPrivateItems}
              selectedPublicItems={selection.selectedPublicItems}
              canDeleteImages={canDeleteImages}
              isLoading={loader.isLoading}
              isMutatingImages={mutations.isMutatingImages}
              downloadingKey={mutations.downloadingKey}
              visibilityMutatingPath={mutations.visibilityMutatingPath}
              onOpenChange={view.setIsImageActionsOpen}
              onToggleAll={selection.toggleAllImages}
              onBulkVisibilityChange={(targetItems, visibility) => void mutations.handleBulkVisibilityChange(targetItems, visibility)}
              onDownloadSelected={() => void mutations.downloadItems("selected", selection.selectedItems)}
              onDownloadAll={() => void mutations.downloadItems("all", filters.filteredItems)}
              onDeleteSelected={() => { view.setIsImageActionsOpen(false); mutations.openDeleteConfirm(selection.selectedItems); }}
              onRefresh={() => void loader.loadImages({ force: true })}
            />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <ImageManagerFilterPanel
          galleryView={filters.galleryView}
          isAdmin={isAdmin}
          itemsCount={items.length}
          filteredCount={filters.filteredItems.length}
          hasLocalFilters={filters.hasLocalFilters}
          serverTotal={loader.serverTotal}
          serverHasMore={loader.serverHasMore}
          currentPage={loader.currentPage}
          hasActiveFilters={filters.hasActiveFilters}
          activeFilterLabels={filters.activeFilterLabels}
          activeFilterCount={filters.activeFilterCount}
          isMobileFiltersOpen={view.isMobileFiltersOpen}
          startDate={filters.startDate}
          endDate={filters.endDate}
          searchKeyword={filters.searchKeyword}
          visibilityFilter={filters.visibilityFilter}
          formatFilter={filters.formatFilter}
          orientationFilter={filters.orientationFilter}
          resolutionFilter={filters.resolutionFilter}
          aspectRatioFilter={filters.aspectRatioFilter}
          autoRefreshMenuScope={view.autoRefreshMenuScope}
          autoRefreshButtonLabel={loader.autoRefreshButtonLabel}
          isAutoRefreshing={loader.isAutoRefreshing}
          isAutoRefreshEnabled={loader.isAutoRefreshEnabled}
          autoRefreshInterval={loader.autoRefreshInterval}
          isLoading={loader.isLoading}
          isMutatingImages={mutations.isMutatingImages}
          onGalleryViewChange={(view) => {
            // Non-admin cannot select "all" even if the UI were spoofed.
            if (!isAdmin && view === "all") return;
            if (view !== filters.galleryView) {
              filters.setGalleryView(view);
              resetListState();
            }
          }}
          onDateRangeChange={(start, end) => { filters.setStartDate(start); filters.setEndDate(end); resetListState(); }}
          onSearchKeywordChange={(value) => { filters.setSearchKeyword(value); resetListState(); }}
          onVisibilityFilterChange={(value) => { filters.setVisibilityFilter(value); resetListState(); }}
          onFormatFilterChange={(value) => { filters.setFormatFilter(value); resetListState(); }}
          onOrientationFilterChange={(value) => { filters.setOrientationFilter(value); resetListState(); }}
          onResolutionFilterChange={(value) => { filters.setResolutionFilter(value); resetListState(); }}
          onAspectRatioFilterChange={(value) => { filters.setAspectRatioFilter(value); resetListState(); }}
          onClearFilters={() => { filters.clearFilters(); resetListState(); }}
          onMobileFiltersOpenChange={view.setIsMobileFiltersOpen}
          onAutoRefreshScopeChange={view.setAutoRefreshMenuScope}
          onToggleAutoRefresh={loader.toggleAutoRefresh}
          onAutoRefreshIntervalChange={(interval) => { loader.updateAutoRefreshInterval(interval); view.setAutoRefreshMenuScope(null); }}
          onRefresh={() => void loader.loadImages({ force: true })}
        />
        <ImageManagerStatusSections
          showLoading={status.showLoading}
          showError={status.showError}
          showEmpty={status.showEmpty}
          showFilteredEmpty={status.showFilteredEmpty}
          loadError={loader.loadError}
          galleryView={filters.galleryView}
          onRetry={() => void loader.loadImages({ force: true })}
        />
        <ImageManagerGrid
          filteredCount={filters.filteredItems.length}
          visibleCount={filters.filteredItems.length}
          imageColumns={imageColumns}
          galleryView={filters.galleryView}
          selectedImageIds={selection.selectedImageIds}
          focusedImagePath={view.focusedImagePath}
          canDeleteImages={canDeleteImages}
          isAdmin={isAdmin}
          isDeleting={mutations.isDeleting}
          deleteTargetPaths={mutations.deleteTarget?.paths ?? []}
          visibilityMutatingPath={mutations.visibilityMutatingPath}
          currentPage={loader.currentPage}
          canGoPrevPage={loader.canGoPrevPage}
          canGoNextPage={loader.canGoNextPage}
          isPageLoading={loader.isPageLoading || loader.isLoading}
          serverTotal={loader.serverTotal}
          onGoPrevPage={() => void loader.goPrevPage()}
          onGoNextPage={() => void loader.goNextPage()}
          onToggleSelection={selection.toggleImageSelection}
          onFocusPathChange={view.setFocusedImagePath}
          onOpenLightbox={(index) => { view.setLightboxIndex(index); view.setLightboxOpen(true); }}
          onDelete={mutations.openDeleteConfirm}
          onVisibilityChange={(item, visibility) => void mutations.handleVisibilityChange(item, visibility)}
        />
      </div>
      <ImageLightbox images={lightboxImages} currentIndex={view.lightboxIndex} open={view.lightboxOpen} onOpenChange={view.setLightboxOpen} onIndexChange={view.setLightboxIndex} />
      <ImageManagerDeleteDialog
        open={canDeleteImages && Boolean(mutations.deleteTarget)}
        target={mutations.deleteTarget}
        isDeleting={mutations.isDeleting}
        onClose={() => mutations.setDeleteTarget(null)}
        onConfirm={() => void mutations.handleConfirmDelete()}
      />
    </section>
  );
}
