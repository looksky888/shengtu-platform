import assert from "node:assert/strict";
import test from "node:test";

import { providerQuotaSlots } from "../src/app/accounts/grok-provider-quota-model.ts";

test("web quota follows reference order and hides grok_4_3", () => {
  const slots = providerQuotaSlots("web", [
    { capability: "expert", remaining: 7, limit_value: 7, reset_at: "", status: "available" },
    { capability: "grok_4_3", remaining: 0, limit_value: 0, reset_at: "", status: "unknown" },
    { capability: "heavy", remaining: 20, limit_value: 20, reset_at: "", status: "available" },
    { capability: "auto", remaining: 7, limit_value: 7, reset_at: "", status: "available" },
    { capability: "fast", remaining: 29, limit_value: 30, reset_at: "", status: "available" },
  ]);

  assert.deepEqual(slots.map((slot) => slot.capability), ["auto", "fast", "expert", "heavy"]);
  assert.deepEqual(slots.map((slot) => slot.used), [0, 1, 0, 0]);
  assert.equal(slots[1].usedPercent, 100 / 30);
});

test("console quota uses capability labels and stable order", () => {
  const slots = providerQuotaSlots("console", [
    { capability: "video", remaining: 3, limit_value: 5, reset_at: "", status: "available" },
    { capability: "chat", remaining: null, limit_value: null, reset_at: "", status: "unknown" },
  ]);

  assert.deepEqual(slots.map((slot) => slot.label), ["文本", "图片", "视频"]);
  assert.equal(slots[1].used, null);
  assert.equal(slots[2].used, 2);
});

test("basic web tier only shows fast quota like the reference project", () => {
  const quotas = [
    { capability: "auto", remaining: 7, limit_value: 7, reset_at: "", status: "available" },
    { capability: "fast", remaining: 29, limit_value: 30, reset_at: "", status: "available" },
  ];

  assert.deepEqual(
    providerQuotaSlots("web", quotas, { webTier: "basic" }).map((slot) => slot.capability),
    ["fast"],
  );
});
