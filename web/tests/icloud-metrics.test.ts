import assert from "node:assert/strict";
import test from "node:test";

import { createICloudMetrics } from "../src/app/icloud/icloud-metrics.ts";

test("iCloud metrics use full summary and canonical ready state", () => {
  const metrics = createICloudMetrics(
    { reachable: true },
    [
      { apple_account_login_state: "ok", icloud_web_login_state: "saved" },
      { apple_account_login_state: "error", icloud_imap_login_state: "ok" },
    ],
    { total: 25, openAIClaimed: 7 },
  );

  assert.equal(metrics[2].value, "新1 / 旧0 / IMAP1");
  assert.equal(metrics[2].tone, "warn");
  assert.equal(metrics[2].detail, "各通道独立判断，请查看账号状态");
  assert.equal(metrics[3].value, 25);
  assert.equal(metrics[3].detail, "GPT 已注册 7");
});

test("expired iCloud Web sessions are not counted as available", () => {
  const metrics = createICloudMetrics(
    { reachable: true },
    [{ apple_account_login_state: "ok", icloud_web_login_state: "expired", icloud_imap_login_state: "saved" }],
    { total: 0, openAIClaimed: 0 },
  );

  assert.equal(metrics[2].value, "新1 / 旧0 / IMAP0");
  assert.equal(metrics[2].tone, "warn");
});
