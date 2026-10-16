import assert from "node:assert/strict";
import test from "node:test";

import {
  configSnapshot,
  mergeConfigSnapshot,
  registerConfigSnapshot,
} from "../src/app/settings/settings-dirty.ts";

test("registration dirty snapshot ignores runtime state", () => {
  const base = {
    enabled: false,
    proxy: "",
    total: 2,
    threads: 1,
    target: "openai",
    mode: "total",
    target_quota: 1,
    target_available: 1,
    check_interval: 5,
    mail: { request_timeout: 15, wait_timeout: 30, wait_interval: 3, providers: [] },
    clearance: { enabled: false },
    grok: {},
    stats: { running: 0, success: 0 },
    logs: [],
  };
  const runtimeUpdated = {
    ...base,
    enabled: true,
    stats: { running: 4, success: 9 },
    logs: [{ time: "now", text: "progress", level: "info" }],
  };
  assert.equal(registerConfigSnapshot(runtimeUpdated), registerConfigSnapshot(base));
  assert.notEqual(registerConfigSnapshot({ ...base, total: 3 }), registerConfigSnapshot(base));
});

test("partial config save advances only the saved baseline fields", () => {
  const baseline = configSnapshot({ proxy: "old", image_worker_count: 2, image_credit_cost_2k: 2 });
  const merged = mergeConfigSnapshot(
    baseline,
    { proxy: "new", image_worker_count: 4, image_credit_cost_2k: 9 },
    ["proxy", "image_worker_count"],
  );
  assert.equal(merged, configSnapshot({ proxy: "new", image_worker_count: 4, image_credit_cost_2k: 2 }));
});

test("write-only secret snapshots compare by provided state", () => {
  assert.equal(
    configSnapshot({ image_proxy_api_key: "first-secret" }),
    configSnapshot({ image_proxy_api_key: "replacement-secret" }),
  );
  assert.notEqual(
    configSnapshot({ image_proxy_api_key: "" }),
    configSnapshot({ image_proxy_api_key: "replacement-secret" }),
  );
});
