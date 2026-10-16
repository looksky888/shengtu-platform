import assert from "node:assert/strict";
import test from "node:test";

import {
  clearModelCatalogCache,
  MODEL_CATALOG_CACHE_KEY,
  readModelCatalogCache,
  writeModelCatalogCache,
} from "../src/lib/model-catalog-cache.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test("model catalog cache round-trips and can be invalidated", () => {
  const target = storage();
  const catalog = { image_models: ["gpt-image-2.5-4k"] };
  writeModelCatalogCache(target, catalog, 123);
  assert.deepEqual(readModelCatalogCache<typeof catalog>(target), { version: 1, storedAt: 123, catalog });
  assert.ok(target.getItem(MODEL_CATALOG_CACHE_KEY));
  clearModelCatalogCache(target);
  assert.equal(readModelCatalogCache(target), null);
});

test("invalid model catalog cache is ignored", () => {
  const target = storage();
  target.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify({ version: 0, storedAt: Date.now(), catalog: {} }));
  assert.equal(readModelCatalogCache(target), null);
});
