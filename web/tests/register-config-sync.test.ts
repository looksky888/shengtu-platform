import assert from "node:assert/strict";
import test from "node:test";

import type { RegisterConfig } from "../src/lib/register-types.ts";
import { registerConfigSnapshot } from "../src/app/settings/settings-dirty.ts";
import {
  isDegradedRegisterPayload,
  normalizeRegisterConfig,
  reconcileIncomingRegisterConfig,
} from "../src/app/settings/settings-register-sync.ts";

function makeBaseRegisterConfig(overrides: Partial<RegisterConfig> = {}): RegisterConfig {
  return normalizeRegisterConfig({
    enabled: false,
    target: "openai",
    backend: "python",
    proxy: "http://127.0.0.1:7890",
    total: 10,
    threads: 2,
    mode: "total",
    target_quota: 50,
    target_available: 20,
    check_interval: 5,
    mail: {
      request_timeout: 15,
      wait_timeout: 30,
      wait_interval: 3,
      providers: [{ enable: true, type: "tempmail_lol", api_key: "key-1", domain: [] }],
    },
    clearance: {
      enabled: true,
      mode: "flaresolverr",
      flaresolverr_url: "http://127.0.0.1:8191",
      timeout_seconds: 60,
      refresh_interval_seconds: 3600,
      proxy: "",
      user_agent: "Mozilla/5.0",
      cf_clearance: "",
      cf_cookies: "",
    },
    grok: { captcha_provider: "capsolver" },
    checkout: { enabled: true },
    sub2api_sync: { enabled: false },
    stats: {
      success: 1,
      fail: 0,
      done: 1,
      running: 0,
      threads: 2,
    },
    logs: [{ time: "10:00:00", text: "boot", level: "info" }],
    ...overrides,
  });
}

test("reconcileIncomingRegisterConfig preserves dirty form edits while updating live SSE telemetry", () => {
  const serverSaved = makeBaseRegisterConfig();
  const savedSnapshot = registerConfigSnapshot(serverSaved);

  const dirtyLocal: RegisterConfig = {
    ...serverSaved,
    target: "grok",
    proxy: "socks5://127.0.0.1:1080",
    total: 88,
    threads: 6,
    mode: "available",
    target_quota: 200,
    target_available: 120,
    check_interval: 12,
    mail: {
      ...serverSaved.mail,
      wait_timeout: 45,
      providers: [
        ...serverSaved.mail.providers,
        { enable: true, type: "duckmail", api_key: "duck-secret", default_domain: "duckmail.sbs" },
      ],
    },
    clearance: {
      ...serverSaved.clearance,
      timeout_seconds: 90,
    },
    grok: { captcha_provider: "yescaptcha", api_key: "edited-key" },
    checkout: { enabled: false },
    sub2api_sync: { enabled: true },
  };

  const sseTick = makeBaseRegisterConfig({
    enabled: true,
    stats: {
      success: 7,
      fail: 2,
      done: 9,
      running: 2,
      threads: 2,
    },
    logs: [
      { time: "10:00:00", text: "boot", level: "info" },
      { time: "10:00:05", text: "registered user@example.com", level: "info" },
    ],
    outlook_pool: { unused: 14, used: 3 },
  });

  const result = reconcileIncomingRegisterConfig({
    currentConfig: dirtyLocal,
    savedRegisterSnapshot: savedSnapshot,
    isSavingRegister: false,
    incoming: sseTick,
  });

  assert.equal(result.degraded, false);
  assert.ok(result.registerConfig);
  assert.equal(result.registerConfig.target, "grok");
  assert.equal(result.registerConfig.proxy, "socks5://127.0.0.1:1080");
  assert.equal(result.registerConfig.total, 88);
  assert.equal(result.registerConfig.threads, 6);
  assert.equal(result.registerConfig.mode, "available");
  assert.equal(result.registerConfig.target_quota, 200);
  assert.equal(result.registerConfig.target_available, 120);
  assert.equal(result.registerConfig.check_interval, 12);
  assert.equal(result.registerConfig.mail.wait_timeout, 45);
  assert.equal(result.registerConfig.mail.providers.length, 2);
  assert.equal(result.registerConfig.clearance.timeout_seconds, 90);
  assert.deepEqual(result.registerConfig.grok, {
    captcha_provider: "yescaptcha",
    api_key: "edited-key",
  });
  assert.deepEqual(result.registerConfig.checkout, { enabled: false });
  assert.deepEqual(result.registerConfig.sub2api_sync, { enabled: true });

  // Live runtime telemetry still updates on SSE tick
  assert.equal(result.registerConfig.enabled, true);
  assert.equal(result.registerConfig.stats.success, 7);
  assert.equal(result.registerConfig.stats.running, 2);
  assert.equal(result.registerConfig.logs.length, 2);
  assert.deepEqual(result.registerConfig.outlook_pool, { unused: 14, used: 3 });

  // Saved snapshot remains pinned to server baseline so dirty state is preserved
  assert.equal(result.savedRegisterSnapshot, savedSnapshot);
  assert.notEqual(registerConfigSnapshot(result.registerConfig), result.savedRegisterSnapshot);
});

test("reconcileIncomingRegisterConfig ignores transient sidecar unavailable envelopes without zeroing config", () => {
  const loaded = makeBaseRegisterConfig({ total: 25, threads: 4 });
  const savedSnapshot = registerConfigSnapshot(loaded);

  const sidecarDownEnvelope = {
    enabled: false,
    backend: "python",
    target: "openai",
    error: "register sidecar unavailable",
  };

  assert.equal(isDegradedRegisterPayload(sidecarDownEnvelope, true), true);

  const result = reconcileIncomingRegisterConfig({
    currentConfig: loaded,
    savedRegisterSnapshot: savedSnapshot,
    incoming: sidecarDownEnvelope,
  });

  assert.equal(result.degraded, true);
  assert.ok(result.registerConfig);
  assert.equal(result.registerConfig.total, 25);
  assert.equal(result.registerConfig.threads, 4);
  assert.equal(result.registerConfig.proxy, "http://127.0.0.1:7890");
  assert.equal(result.registerConfig.mail.providers.length, 1);
  assert.equal(result.registerConfig.error, "register sidecar unavailable");
  assert.equal(result.savedRegisterSnapshot, savedSnapshot);
});

test("reconcileIncomingRegisterConfig updates clean config and advances savedRegisterSnapshot only when server editable config changes", () => {
  const initial = makeBaseRegisterConfig({ total: 10 });
  const initialSnap = registerConfigSnapshot(initial);

  // Runtime-only SSE tick while clean keeps exact snapshot string
  const runtimeOnly = makeBaseRegisterConfig({
    total: 10,
    stats: { success: 3, fail: 0, done: 3, running: 1, threads: 2 },
  });
  const afterRuntime = reconcileIncomingRegisterConfig({
    currentConfig: initial,
    savedRegisterSnapshot: initialSnap,
    incoming: runtimeOnly,
  });
  assert.equal(afterRuntime.savedRegisterSnapshot, initialSnap);
  assert.equal(afterRuntime.registerConfig?.stats.success, 3);

  // Editable config change from server while clean updates both config and snapshot
  const serverUpdated = makeBaseRegisterConfig({ total: 30 });
  const afterServerEdit = reconcileIncomingRegisterConfig({
    currentConfig: afterRuntime.registerConfig,
    savedRegisterSnapshot: afterRuntime.savedRegisterSnapshot,
    incoming: serverUpdated,
  });
  assert.equal(afterServerEdit.registerConfig?.total, 30);
  assert.notEqual(afterServerEdit.savedRegisterSnapshot, initialSnap);
  assert.equal(afterServerEdit.savedRegisterSnapshot, registerConfigSnapshot(serverUpdated));
});
