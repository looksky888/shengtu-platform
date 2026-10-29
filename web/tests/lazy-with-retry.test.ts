import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_RELOAD_AT_KEY,
  ASSET_RELOAD_COOLDOWN_MS,
  isDynamicImportError,
  tryReloadForStaleAsset,
} from "../src/lib/lazy-with-retry.ts";

test("isDynamicImportError matches browser module chunk failures only", () => {
  assert.equal(
    isDynamicImportError(
      new TypeError(
        "Failed to fetch dynamically imported module: https://www.shengtu.xyz/assets/page-abc123.js",
      ),
    ),
    true,
  );
  assert.equal(
    isDynamicImportError(new TypeError("Importing a module script failed.")),
    true,
  );
  assert.equal(
    isDynamicImportError(
      new Error("error loading dynamically imported module: /assets/foo.js"),
    ),
    true,
  );
  assert.equal(
    isDynamicImportError(new Error("Cannot read properties of undefined")),
    false,
  );
});

test("tryReloadForStaleAsset enforces 60s reload cooldown", () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  let reloads = 0;
  const reload = () => {
    reloads += 1;
  };

  assert.equal(tryReloadForStaleAsset(storage, reload, 100_000), true);
  assert.equal(reloads, 1);
  assert.equal(map.get(ASSET_RELOAD_AT_KEY), "100000");

  // Within cooldown window -> suppressed.
  assert.equal(
    tryReloadForStaleAsset(storage, reload, 100_000 + ASSET_RELOAD_COOLDOWN_MS - 1),
    false,
  );
  assert.equal(reloads, 1);

  // Past cooldown window -> allowed again.
  assert.equal(
    tryReloadForStaleAsset(storage, reload, 100_000 + ASSET_RELOAD_COOLDOWN_MS + 1),
    true,
  );
  assert.equal(reloads, 2);
});
