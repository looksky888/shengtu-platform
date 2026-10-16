import assert from "node:assert/strict";
import test from "node:test";

import { isTaskQueueRefreshEvent } from "../src/app/task-queue/task-queue-event.ts";

test("task queue SSE refreshes only for relevant canonical event types", () => {
  assert.equal(isTaskQueueRefreshEvent('{"type":"task"}'), true);
  assert.equal(isTaskQueueRefreshEvent('{"type":"refresh"}'), true);
  assert.equal(isTaskQueueRefreshEvent('{"type":"pool"}'), true);
  assert.equal(isTaskQueueRefreshEvent('{"type":"heartbeat"}'), false);
  assert.equal(isTaskQueueRefreshEvent("{"), false);
});
