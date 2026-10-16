import assert from "node:assert/strict";
import test from "node:test";

import { createRequestId } from "../src/lib/request-id.ts";

test("request id uses randomUUID when available", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "fixed-uuid" } });
  try { assert.equal(createRequestId("payment"), "payment-fixed-uuid"); }
  finally { if (original) Object.defineProperty(globalThis, "crypto", original); else Reflect.deleteProperty(globalThis, "crypto"); }
});

test("request id falls back when randomUUID is unavailable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: undefined } });
  try {
    const first = createRequestId("payment");
    const second = createRequestId("payment");
    assert.match(first, /^payment-[a-z0-9]+-[a-f0-9]{24}$/);
    assert.notEqual(first, second);
  } finally { if (original) Object.defineProperty(globalThis, "crypto", original); else Reflect.deleteProperty(globalThis, "crypto"); }
});
