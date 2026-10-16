export const MODEL_CATALOG_CACHE_KEY = "chatgpt2api:model-catalog-cache";
export const MODEL_CATALOG_CACHE_VERSION = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ModelCatalogCacheEntry<T> = {
  version: number;
  storedAt: number;
  catalog: T;
};

export function readModelCatalogCache<T>(storage?: StorageLike): ModelCatalogCacheEntry<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(MODEL_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ModelCatalogCacheEntry<T>>;
    if (parsed.version !== MODEL_CATALOG_CACHE_VERSION || !Number.isFinite(parsed.storedAt) || parsed.catalog == null) return null;
    return { version: MODEL_CATALOG_CACHE_VERSION, storedAt: Number(parsed.storedAt), catalog: parsed.catalog as T };
  } catch {
    return null;
  }
}

export function writeModelCatalogCache<T>(storage: StorageLike | undefined, catalog: T, storedAt = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify({ version: MODEL_CATALOG_CACHE_VERSION, storedAt, catalog }));
  } catch {
    // A full or disabled browser storage must not block the model menu.
  }
}

export function clearModelCatalogCache(storage?: StorageLike) {
  try {
    storage?.removeItem(MODEL_CATALOG_CACHE_KEY);
  } catch {
    // Ignore storage cleanup failures; the in-memory cache is cleared separately.
  }
}
