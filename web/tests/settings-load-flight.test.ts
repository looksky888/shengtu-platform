import assert from "node:assert/strict";
import test from "node:test";

import {
  invalidateSettingsRequests,
  runSettingsRequest,
  type SettingsRequestFlight,
} from "../src/app/settings/settings-load-flight.ts";

test("settings requests started before a session change become stale", async () => {
  const flight: SettingsRequestFlight = { value: null };
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let oldRequestWasCurrent = true;

  const oldRequest = runSettingsRequest(flight, async (isCurrent) => {
    await waiting;
    oldRequestWasCurrent = isCurrent();
  });

  invalidateSettingsRequests();
  const newRequest = runSettingsRequest(flight, async (isCurrent) => {
    assert.equal(isCurrent(), true);
  });
  assert.notEqual(newRequest, oldRequest);

  release();
  await Promise.all([oldRequest, newRequest]);
  assert.equal(oldRequestWasCurrent, false);
});
