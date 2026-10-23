import assert from "node:assert/strict";
import test from "node:test";

import {
  configSnapshot,
  extractSavedConfigSection,
  isConfigKeysDirty,
  mergeConfigSnapshot,
  registerConfigSnapshot,
} from "../src/app/settings/settings-dirty.ts";
import {
  getSettingsDomainForTab,
  SETTINGS_DOMAIN_GROUPS,
  SETTINGS_TABS,
} from "../src/app/settings/settings-tab-types.ts";

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

test("isConfigKeysDirty attributes unsaved changes only to the modified section keys", () => {
  const baselineConfig = {
    proxy: "http://127.0.0.1:7890",
    base_url: "https://studio.example.com",
    log_retention_days: 7,
    media_r2_secret_access_key: "",
  };
  const snapshot = configSnapshot(baselineConfig);

  const editedLogRetention = {
    ...baselineConfig,
    log_retention_days: 30,
  };

  assert.equal(isConfigKeysDirty(editedLogRetention, snapshot, ["base_url"]), false);
  assert.equal(isConfigKeysDirty(editedLogRetention, snapshot, ["log_retention_days"]), true);

  const editedSecret = {
    ...baselineConfig,
    media_r2_secret_access_key: "new-r2-secret",
  };
  assert.equal(
    isConfigKeysDirty(editedSecret, snapshot, ["media_r2_secret_access_key"]),
    true,
  );
});

test("extractSavedConfigSection restores non-secret baseline values and clears write-only secrets", () => {
  const snapshot = configSnapshot({
    proxy: "",
    base_url: "https://saved.example.com",
    log_retention_days: 14,
    media_r2_secret_access_key: "typed-secret",
  });

  const restored = extractSavedConfigSection(snapshot, [
    "base_url",
    "log_retention_days",
    "media_r2_secret_access_key",
  ]);

  assert.deepEqual(restored, {
    base_url: "https://saved.example.com",
    log_retention_days: 14,
    media_r2_secret_access_key: "",
  });
});

test("settings domain groups cover all 10 settings tabs without duplicates", () => {
  const groupedTabs = SETTINGS_DOMAIN_GROUPS.flatMap((group) => group.tabs);
  const allTabs = SETTINGS_TABS.map((tab) => tab.key);

  assert.equal(groupedTabs.length, allTabs.length);
  assert.deepEqual(new Set(groupedTabs), new Set(allTabs));
  assert.equal(getSettingsDomainForTab("base"), "core");
  assert.equal(getSettingsDomainForTab("email"), "access");
  assert.equal(getSettingsDomainForTab("storage"), "content");
  assert.equal(getSettingsDomainForTab("system-update"), "ops");
});
