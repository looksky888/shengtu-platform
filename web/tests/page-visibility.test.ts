import assert from "node:assert/strict";
import test from "node:test";

import { isPageVisible, subscribePageVisibility } from "../src/lib/page-visibility.ts";

class FakeVisibilitySource {
  visibilityState = "visible";
  private listeners = new Set<() => void>();

  addEventListener(type: "visibilitychange", listener: () => void) {
    if (type === "visibilitychange") this.listeners.add(listener);
  }

  removeEventListener(type: "visibilitychange", listener: () => void) {
    if (type === "visibilitychange") this.listeners.delete(listener);
  }

  emitVisibilityChange() {
    this.listeners.forEach((listener) => listener());
  }

  listenerCount() {
    return this.listeners.size;
  }
}

test("page visibility treats hidden as paused and SSR as visible", () => {
  assert.equal(isPageVisible({ visibilityState: "visible" }), true);
  assert.equal(isPageVisible({ visibilityState: "hidden" }), false);
  assert.equal(isPageVisible(undefined), true);
});

test("page visibility subscription attaches and cleans its listener", () => {
  const source = new FakeVisibilitySource();
  let calls = 0;
  const unsubscribe = subscribePageVisibility(() => {
    calls += 1;
  }, source);

  assert.equal(source.listenerCount(), 1);
  source.emitVisibilityChange();
  assert.equal(calls, 1);
  unsubscribe();
  source.emitVisibilityChange();
  assert.equal(calls, 1);
  assert.equal(source.listenerCount(), 0);
});
