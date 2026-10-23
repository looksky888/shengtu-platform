import { useCallback, useMemo, useState } from "react";

import type { AutoRefreshMenuScope } from "@/app/image-manager/image-manager-types";
import { getManagedImageResolutionSummary } from "@/app/image-manager/image-manager-utils";
import type { ManagedImage } from "@/lib/api";
import { formatImageFileSize } from "@/lib/image-size";
import { getImageManagerCache, imageManagerCacheKey, type ImageGalleryView } from "@/lib/image-manager-cache";

export type ImageManagerContentProps = {
  cacheScope: string;
  canDeleteImages: boolean;
  isAdmin: boolean;
};

export function useImageManagerInitialItems(cacheScope: string, isAdmin: boolean) {
  const initialGalleryView: ImageGalleryView = isAdmin ? "all" : "mine";
  const initialCacheKey = imageManagerCacheKey(cacheScope, initialGalleryView, "", "");
  const initialCache = getImageManagerCache(initialCacheKey);
  const [items, setItems] = useState<ManagedImage[]>(() => initialCache?.items ?? []);
  return { initialGalleryView, initialCache, items, setItems };
}

export function useImageManagerViewState() {
  const [focusedImagePath, setFocusedImagePath] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isImageActionsOpen, setIsImageActionsOpen] = useState(false);
  const [autoRefreshMenuScope, setAutoRefreshMenuScope] = useState<AutoRefreshMenuScope | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setLightboxIndex(0);
  }, []);
  return {
    focusedImagePath,
    setFocusedImagePath,
    lightboxIndex,
    setLightboxIndex,
    lightboxOpen,
    setLightboxOpen,
    isImageActionsOpen,
    setIsImageActionsOpen,
    autoRefreshMenuScope,
    setAutoRefreshMenuScope,
    isMobileFiltersOpen,
    setIsMobileFiltersOpen,
    closeLightbox,
  };
}

export function useImageManagerLightboxImages(items: ManagedImage[]) {
  return useMemo(
    () =>
      items.map((item) => ({
        id: item.name,
        src: item.url,
        downloadName: item.name,
        sizeLabel: formatImageFileSize(item.size),
        dimensions: getManagedImageResolutionSummary(item) || undefined,
      })),
    [items],
  );
}

export function getImageManagerStatus(
  isLoading: boolean,
  loadError: string,
  itemCount: number,
  filteredCount: number,
  hasActiveFilters = false,
) {
  const isFilteredEmpty =
    !isLoading &&
    loadError === "" &&
    filteredCount === 0 &&
    (itemCount > 0 || hasActiveFilters);
  return {
    showLoading: isLoading && itemCount === 0,
    showError: !isLoading && loadError !== "" && itemCount === 0,
    showEmpty: !isLoading && loadError === "" && itemCount === 0 && !hasActiveFilters,
    showFilteredEmpty: isFilteredEmpty,
  };
}
