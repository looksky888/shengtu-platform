import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelPaymentOnLeave,
  shouldWarnBeforeLeavingPendingOrder,
} from "../src/lib/payment-order-leave.ts";

test("shouldWarnBeforeLeavingPendingOrder matches only created and pending orders", () => {
  assert.equal(shouldWarnBeforeLeavingPendingOrder(null), false);
  assert.equal(shouldWarnBeforeLeavingPendingOrder(undefined), false);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "created" }), true);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "pending" }), true);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "closing" }), false);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "succeeded" }), false);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "closed" }), false);
  assert.equal(shouldWarnBeforeLeavingPendingOrder({ status: "failed" }), false);
});

test("leave cancellation preserves API base, authentication and keepalive", async (t) => {
  let captured: { url: unknown; init?: RequestInit } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    captured = { url, init };
    return new Response("{}", { status: 200 });
  });
  await cancelPaymentOnLeave("https://api.example.test/prefix/", "fixture-session", "order/1");
  assert.equal(captured?.url, "https://api.example.test/prefix/api/payment/orders/order%2F1/cancel");
  assert.equal(captured?.init?.keepalive, true);
  assert.equal(captured?.init?.credentials, "include");
  assert.equal(new Headers(captured?.init?.headers).get("Authorization"), "Bearer fixture-session");
  assert.equal(captured?.init?.body, "{}");
});

test("leave cancellation exposes HTTP and network failures", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  await assert.rejects(cancelPaymentOnLeave("", "fixture", "1"), /关单未确认/);
  mocked.mock.mockImplementation(async () => { throw new Error("offline"); });
  await assert.rejects(cancelPaymentOnLeave("", "fixture", "1"), /offline/);
});

test("leave cancellation tolerates a payment winning the close race", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 409 }));
  await cancelPaymentOnLeave("", "fixture", "1");
});
