import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  IMAGE_MANAGER_SERVER_PAGE_SIZE,
  type ImageAutoRefreshInterval,
} from "@/app/image-manager/image-manager-types";
import {
  isRequestCanceled,
  latestManagedImageUpdatedStamp,
  mergeManagedImagesByPath,
} from "@/app/image-manager/image-manager-utils";
import { fetchManagedImages, type ManagedImage } from "@/lib/api";
import { updateImageManagerCache, type ImageGalleryView } from "@/lib/image-manager-cache";
import { usePageVisible } from "@/lib/use-page-visible";

const SILENT_ERROR_TOAST_COOLDOWN_MS = 30_000;

type UseImageManagerAutoRefreshOptions = {
  currentCacheKey: string;
  galleryView: ImageGalleryView;
  startDate: string;
  endDate: string;
  items: ManagedImage[];
  setItems: Dispatch<SetStateAction<ManagedImage[]>>;
  currentPage: number;
  isLoading: boolean;
  isPageLoading: boolean;
  isMutatingImages: boolean;
};

export function useImageManagerAutoRefresh({
  currentCacheKey,
  galleryView,
  startDate,
  endDate,
  items,
  setItems,
  currentPage,
  isLoading,
  isPageLoading,
  isMutatingImages,
}: UseImageManagerAutoRefreshOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const lastErrorToastAtRef = useRef(0);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<ImageAutoRefreshInterval>(30);
  const [autoRefreshSecondsRemaining, setAutoRefreshSecondsRemaining] = useState(autoRefreshInterval);
  const pageVisible = usePageVisible();

  const toastSilentError = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastErrorToastAtRef.current < SILENT_ERROR_TOAST_COOLDOWN_MS) return;
    lastErrorToastAtRef.current = now;
    toast.error(message);
  }, []);

  const refreshNewImages = useCallback(async () => {
    if (isLoading || isPageLoading || isMutatingImages || abortRef.current) return;
    if (currentPage !== 1) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsAutoRefreshing(true);
    try {
      const updatedAfter = latestManagedImageUpdatedStamp(items);
      const data = await fetchManagedImages(
        {
          scope: galleryView,
          start_date: startDate,
          end_date: endDate,
          limit: IMAGE_MANAGER_SERVER_PAGE_SIZE,
          updated_after: updatedAfter || undefined,
        },
        { signal: controller.signal },
      );
      if (data.items.length === 0) return;
      setItems((current) => {
        const next = mergeManagedImagesByPath(current, data.items).slice(0, IMAGE_MANAGER_SERVER_PAGE_SIZE);
        updateImageManagerCache(currentCacheKey, next);
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) return;
      toastSilentError(error instanceof Error ? error.message : "自动刷新图片失败");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsAutoRefreshing(false);
    }
  }, [
    currentCacheKey,
    currentPage,
    endDate,
    galleryView,
    isLoading,
    isMutatingImages,
    isPageLoading,
    items,
    setItems,
    startDate,
    toastSilentError,
  ]);

  const toggleAutoRefresh = useCallback(() => {
    const next = !isAutoRefreshEnabled;
    setIsAutoRefreshEnabled(next);
    if (!next) {
      abortRef.current?.abort();
      setIsAutoRefreshing(false);
    }
    setAutoRefreshSecondsRemaining(autoRefreshInterval);
  }, [autoRefreshInterval, isAutoRefreshEnabled]);

  const updateAutoRefreshInterval = useCallback((interval: ImageAutoRefreshInterval) => {
    setAutoRefreshInterval(interval);
    setAutoRefreshSecondsRemaining(interval);
    setIsAutoRefreshEnabled(true);
  }, []);

  useEffect(() => {
    if (!isAutoRefreshEnabled || !pageVisible) {
      abortRef.current?.abort();
      setIsAutoRefreshing(false);
      if (!isAutoRefreshEnabled) setAutoRefreshSecondsRemaining(autoRefreshInterval);
      return;
    }
    let secondsUntilNextRefresh = autoRefreshInterval;
    setAutoRefreshSecondsRemaining(secondsUntilNextRefresh);
    const timer = window.setInterval(() => {
      secondsUntilNextRefresh -= 1;
      if (secondsUntilNextRefresh <= 0) {
        void refreshNewImages();
        secondsUntilNextRefresh = autoRefreshInterval;
      }
      setAutoRefreshSecondsRemaining(secondsUntilNextRefresh);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshInterval, isAutoRefreshEnabled, pageVisible, refreshNewImages]);

  useEffect(() => {
    abortRef.current?.abort();
  }, [currentCacheKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    isAutoRefreshing,
    isAutoRefreshEnabled,
    autoRefreshInterval,
    autoRefreshSecondsRemaining,
    autoRefreshButtonLabel: isAutoRefreshEnabled
      ? `自动刷新: ${autoRefreshSecondsRemaining}s`
      : "自动刷新: 关闭",
    toggleAutoRefresh,
    updateAutoRefreshInterval,
  };
}
