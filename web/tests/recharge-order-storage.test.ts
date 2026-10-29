import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_RECHARGE_ORDER_STORAGE_KEY,
  loadActiveRechargeOrder,
  syncActiveRechargeOrderStorage,
  type StorageLike,
} from "../src/app/recharge/recharge-order-storage.ts";
import type { PaymentOrder } from "../src/lib/user-payment-api.ts";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function sampleOrder(status = "pending"): PaymentOrder {
  return {
    id: "ord_test_1001",
    out_trade_no: "OTN202610290001",
    channel_id: "ch_wx",
    product_id: "prod_100",
    product_name: "100 积分包",
    product_type: "credits",
    amount_fen: 990,
    currency: "CNY",
    credits: 100,
    storage_bytes: 0,
    storage_days: 0,
    status,
    code_url: "weixin://wxpay/bizpayurl?pr=test",
    expires_at: "2026-10-30T00:00:00+08:00",
    created_at: "2026-10-29T23:50:00+08:00",
    updated_at: "2026-10-29T23:50:00+08:00",
  };
}

test("persists pending recharge order without storing raw session token and restores for same user", () => {
  const storage = createMemoryStorage();
  const now = 1_760_000_000_000;
  const order = sampleOrder("pending");

  syncActiveRechargeOrderStorage("sk-secret-user-session-a", order, storage, now);
  const raw = storage.getItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
  assert.ok(raw);
  assert.equal(raw.includes("sk-secret-user-session-a"), false);

  const restored = loadActiveRechargeOrder("sk-secret-user-session-a", storage, now + 30_000);
  assert.deepEqual(restored, order);

  const otherUser = loadActiveRechargeOrder("sk-secret-user-session-b", storage, now + 30_000);
  assert.equal(otherUser, null);
});

test("clears persisted recharge order when status transitions to succeeded or closed", () => {
  const storage = createMemoryStorage();
  const now = 1_760_000_000_000;

  syncActiveRechargeOrderStorage("sk-user-1", sampleOrder("created"), storage, now);
  assert.ok(loadActiveRechargeOrder("sk-user-1", storage, now + 1000));

  syncActiveRechargeOrderStorage("sk-user-1", sampleOrder("succeeded"), storage, now + 2000);
  assert.equal(loadActiveRechargeOrder("sk-user-1", storage, now + 3000), null);
  assert.equal(storage.getItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY), null);
});

test("drops stale persisted recharge orders older than 24 hours", () => {
  const storage = createMemoryStorage();
  const now = 1_760_000_000_000;

  syncActiveRechargeOrderStorage("sk-user-1", sampleOrder("pending"), storage, now);
  const expired = loadActiveRechargeOrder("sk-user-1", storage, now + 25 * 60 * 60 * 1000);
  assert.equal(expired, null);
  assert.equal(storage.getItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY), null);
});
