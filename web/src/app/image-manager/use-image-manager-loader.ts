import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { IMAGE_MANAGER_SERVER_PAGE_SIZE } from "@/app/image-manager/image-manager-types";
import { isRequestCanceled } from "@/app/image-manager/image-manager-utils";
import { useImageManagerAutoRefresh } from "@/app/image-manager/use-image-manager-auto-refresh";
import { fetchManagedImages, type ManagedImage } from "@/lib/api";
import {
  getImageManagerCache,
  isFreshImageManagerCache,
  updateImageManagerCache,
  type ImageGalleryView,
} from "@/lib/image-manager-cache";

/** Server page size for F-09 index pagination (one page at a time). */
const SERVER_PAGE_LIMIT = IMAGE_MANAGER_SERVER_PAGE_SIZE;
type UseImageManagerLoaderOptions = {
  currentCacheKey: string;
  galleryView: ImageGalleryView;
  startDate: string;
  endDate: string;
  items: ManagedImage[];
  setItems: Dispatch<SetStateAction<ManagedImage[]>>;
  hasInitialCache: boolean;
  isMutatingImages: boolean;
  resetSelection: () => void;
};

export function useImageManagerLoader({
  currentCacheKey,
  galleryView,
  startDate,
  endDate,
  items,
  setItems,
  hasInitialCache,
  isMutatingImages,
  resetSelection,
}: UseImageManagerLoaderOptions) {
  const activeLoadRef = useRef<AbortController | null>(null);
  const pageLoadAbortRef = useRef<AbortController | null>(null);
  const pageRequestSeq = useRef(0);

  /** Cursor that was used to fetch the current page ("" for page 1). */
  const currentPageCursorRef = useRef("");
  /** Server next_cursor after the current page. */
  const nextCursorRef = useRef("");
  /** Stack of previous page request-cursors (for 上一页). */
  const cursorStackRef = useRef<string[]>([]);

  const resetSelectionRef = useRef(resetSelection);
  resetSelectionRef.current = resetSelection;

  const [serverHasMore, setServerHasMore] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !hasInitialCache);
  const [loadError, setLoadError] = useState("");

  const autoRefresh = useImageManagerAutoRefresh({
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
  });

  const clearLoadError = useCallback(() => setLoadError(""), []);

  const applyPageResult = useCallback(
    (
      data: {
        items: ManagedImage[];
        next_cursor?: string;
        has_more?: boolean;
        total?: number;
      },
      requestCursor: string,
      page: number,
      stack: string[],
    ) => {
      const nextCursor = data.next_cursor || "";
      const hasMore = Boolean(data.has_more && nextCursor);
      const total =
        typeof data.total === "number" && data.total > 0 ? data.total : data.items.length;
      currentPageCursorRef.current = requestCursor;
      nextCursorRef.current = nextCursor;
      cursorStackRef.current = stack;
      setServerHasMore(hasMore);
      setServerTotal(total);
      setCurrentPage(page);
      setItems(data.items);
      // Cache only the current page (≤100) to avoid DOM/memory growth.
      if (page === 1 && requestCursor === "") {
        updateImageManagerCache(currentCacheKey, data.items, { nextCursor, hasMore, total });
      }
      resetSelectionRef.current();
    },
    [currentCacheKey, setItems],
  );

  const loadImages = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const cached = getImageManagerCache(currentCacheKey);
      if (!force && cached) {
        setItems(cached.items);
        resetSelectionRef.current();
        setLoadError("");
        if (typeof cached.total === "number" && cached.total > 0) {
          setServerTotal(cached.total);
        } else {
          setServerTotal(cached.items.length);
        }
        if (isFreshImageManagerCache(cached)) {
          setIsLoading(false);
          // Fresh cache is always treated as page 1 snapshot (never append cache).
          currentPageCursorRef.current = "";
          nextCursorRef.current = cached.nextCursor || "";
          cursorStackRef.current = [];
          setCurrentPage(1);
          setServerHasMore(Boolean(cached.hasMore && cached.nextCursor));
          return;
        }
      }

      activeLoadRef.current?.abort();
      pageLoadAbortRef.current?.abort();
      const controller = new AbortController();
      activeLoadRef.current = controller;
      const seq = ++pageRequestSeq.current;
      setIsLoading(true);
      setIsPageLoading(true);
      setLoadError("");
      try {
        const data = await fetchManagedImages(
          {
            scope: galleryView,
            start_date: startDate,
            end_date: endDate,
            limit: SERVER_PAGE_LIMIT,
          },
          { signal: controller.signal },
        );
        if (seq !== pageRequestSeq.current) return;
        applyPageResult(data, "", 1, []);
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error) || seq !== pageRequestSeq.current) return;
        const message = error instanceof Error ? error.message : "加载图片失败";
        if (force || !cached) {
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (activeLoadRef.current === controller) {
          activeLoadRef.current = null;
          setIsLoading(false);
          setIsPageLoading(false);
        }
      }
    },
    [applyPageResult, currentCacheKey, endDate, galleryView, setItems, startDate],
  );

  const fetchPageByCursor = useCallback(
    async (requestCursor: string, page: number, stack: string[]) => {
      if (isMutatingImages) return false;
      pageLoadAbortRef.current?.abort();
      activeLoadRef.current?.abort();
      const controller = new AbortController();
      pageLoadAbortRef.current = controller;
      const seq = ++pageRequestSeq.current;
      setIsPageLoading(true);
      setLoadError("");
      try {
        const data = await fetchManagedImages(
          {
            scope: galleryView,
            start_date: startDate,
            end_date: endDate,
            limit: SERVER_PAGE_LIMIT,
            cursor: requestCursor || undefined,
          },
          { signal: controller.signal },
        );
        if (seq !== pageRequestSeq.current) return false;
        applyPageResult(data, requestCursor, page, stack);
        // Scroll to top of gallery so user sees the new page from the start.
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error) || seq !== pageRequestSeq.current) {
          return false;
        }
        toast.error(error instanceof Error ? error.message : "切换分页失败");
        return false;
      } finally {
        if (pageLoadAbortRef.current === controller) {
          pageLoadAbortRef.current = null;
          setIsPageLoading(false);
          setIsLoading(false);
        }
      }
    },
    [applyPageResult, endDate, galleryView, isMutatingImages, startDate],
  );

  const goNextPage = useCallback(async () => {
    if (isLoading || isPageLoading || isMutatingImages) return false;
    if (!serverHasMore || !nextCursorRef.current) return false;
    const nextRequestCursor = nextCursorRef.current;
    const stack = [...cursorStackRef.current, currentPageCursorRef.current];
    return fetchPageByCursor(nextRequestCursor, currentPage + 1, stack);
  }, [currentPage, fetchPageByCursor, isLoading, isMutatingImages, isPageLoading, serverHasMore]);

  const goPrevPage = useCallback(async () => {
    if (isLoading || isPageLoading || isMutatingImages) return false;
    if (cursorStackRef.current.length === 0 || currentPage <= 1) return false;
    const stack = [...cursorStackRef.current];
    const prevCursor = stack.pop() ?? "";
    return fetchPageByCursor(prevCursor, currentPage - 1, stack);
  }, [currentPage, fetchPageByCursor, isLoading, isMutatingImages, isPageLoading]);

  useEffect(() => {
    pageLoadAbortRef.current?.abort();
    pageRequestSeq.current += 1;
    currentPageCursorRef.current = "";
    nextCursorRef.current = "";
    cursorStackRef.current = [];
    setServerHasMore(false);
    setServerTotal(0);
    setCurrentPage(1);
    void loadImages();
  }, [currentCacheKey, loadImages]);

  useEffect(
    () => () => {
      activeLoadRef.current?.abort();
      pageLoadAbortRef.current?.abort();
    },
    [],
  );

  // currentPage / serverHasMore are React state; cursor refs are synced in applyPageResult.
  const canGoPrevPage = currentPage > 1;
  const canGoNextPage = serverHasMore;

  return {
    isLoading,
    loadError,
    serverTotal,
    serverHasMore,
    currentPage,
    canGoPrevPage,
    canGoNextPage,
    isPageLoading,
    ...autoRefresh,
    clearLoadError,
    loadImages,
    goNextPage,
    goPrevPage,
  };
}
