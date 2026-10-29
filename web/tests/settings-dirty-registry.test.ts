import assert from "node:assert/strict";
import test from "node:test";

import { createSettingsDirtyRegistryStore } from "../src/app/settings/settings-dirty-registry-store.ts";

test("settings dirty registry store preserves multiple card registrations without ping-pong notifications", () => {
  const store = createSettingsDirtyRegistryStore<"base" | "email" | "storage">();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  const validateBase = () => true;
  store.upsertEntry({
    id: "config-card",
    tab: "base",
    label: "平台并发与限流",
    isDirty: false,
    validate: validateBase,
  });
  store.upsertEntry({
    id: "canvas-link",
    tab: "base",
    label: "画布外链",
    isDirty: false,
  });
  store.upsertEntry({
    id: "login-visual",
    tab: "base",
    label: "登录页视觉",
    isDirty: false,
  });

  assert.equal(notifications, 3);
  const snapshotAfterMount = store.getSnapshot();
  assert.deepEqual(Object.keys(snapshotAfterMount), [
    "config-card",
    "canvas-link",
    "login-visual",
  ]);

  // Re-upserting identical entries (e.g. parent re-renders) must be a strict no-op.
  store.upsertEntry({
    id: "config-card",
    tab: "base",
    label: "平台并发与限流",
    isDirty: false,
    validate: validateBase,
  });
  assert.equal(notifications, 3);
  assert.equal(store.getSnapshot(), snapshotAfterMount);

  // Toggling dirty state updates only that entry and notifies once.
  store.upsertEntry({
    id: "canvas-link",
    tab: "base",
    label: "画布外链",
    isDirty: true,
  });
  assert.equal(notifications, 4);
  assert.equal(store.getSnapshot()["canvas-link"]?.isDirty, true);
  assert.equal(store.getSnapshot()["config-card"]?.isDirty, false);

  // Removing a non-existent id is a no-op; removing an existing id removes only that entry.
  store.removeEntry("missing-card");
  assert.equal(notifications, 4);

  store.removeEntry("canvas-link");
  assert.equal(notifications, 5);
  assert.deepEqual(Object.keys(store.getSnapshot()), [
    "config-card",
    "login-visual",
  ]);

  unsubscribe();
  store.removeEntry("config-card");
  assert.equal(notifications, 5);
});
