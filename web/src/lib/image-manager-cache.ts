import type { ManagedImage } from "@/lib/api";

export type ImageGalleryView = "mine" | "public" | "all";

export type ImageManagerCacheEntry = {
  items: ManagedImage[];
  updatedAt: number;
  /** Server pagination cursor from the last first-page / full load. */
  nextCursor?: string;
  /** Whether the server reported more pages after the cached items. */
  hasMore?: boolean;
  /** Server-side total matching the current filters (not just loaded items). */
  total?: number;
};

const IMAGE_MANAGER_CACHE_TTL_MS = 30 * 1000;
const imageManagerCache = new Map<string, ImageManagerCacheEntry>();

export function imageManagerCacheKey(cacheScope: string, view: ImageGalleryView, startDate: string, endDate: string) {
  return [cacheScope, view, startDate, endDate].join("|");
}

export function getImageManagerCache(cacheKey: string) {
  return imageManagerCache.get(cacheKey);
}

export function isFreshImageManagerCache(entry: ImageManagerCacheEntry) {
  return Date.now() - entry.updatedAt < IMAGE_MANAGER_CACHE_TTL_MS;
}

export type ImageManagerCachePageMeta = {
  nextCursor?: string;
  hasMore?: boolean;
  total?: number;
};

export function updateImageManagerCache(cacheKey: string, items: ManagedImage[], page?: ImageManagerCachePageMeta) {
  const prev = imageManagerCache.get(cacheKey);
  imageManagerCache.set(cacheKey, {
    items,
    updatedAt: Date.now(),
    // Preserve cursor/hasMore/total when only items are updated (e.g. local mutation/merge).
    nextCursor: page?.nextCursor !== undefined ? page.nextCursor : prev?.nextCursor,
    hasMore: page?.hasMore !== undefined ? page.hasMore : prev?.hasMore,
    total: page?.total !== undefined ? page.total : prev?.total,
  });
}

export function removeCachedManagedImages(paths: string[]) {
  const pathSet = new Set(paths);
  for (const [key, entry] of imageManagerCache) {
    const items = entry.items.filter((item) => !pathSet.has(item.path));
    const removedCount = entry.items.length - items.length;
    if (removedCount > 0) {
      imageManagerCache.set(key, {
        ...entry,
        items,
        total:
          typeof entry.total === "number"
            ? Math.max(0, entry.total - removedCount)
            : entry.total,
        updatedAt: Date.now(),
      });
    }
  }
}

export function clearImageManagerCache() {
  imageManagerCache.clear();
}
