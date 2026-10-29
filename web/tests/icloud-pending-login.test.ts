import assert from "node:assert/strict";
import test from "node:test";

import {
  iCloudPendingLoginKey,
  removeICloudPendingLogin,
  upsertICloudPendingLogin,
} from "../src/app/icloud/icloud-pending-login.ts";

test("pending 2FA challenges are isolated by channel and Apple ID", () => {
  const first = { pending_id: "pending-a", channel: "apple" as const, apple_id: "A@icloud.com" };
  const second = { pending_id: "pending-b", channel: "apple" as const, apple_id: "b@icloud.com" };
  let pending = upsertICloudPendingLogin({}, first);
  pending = upsertICloudPendingLogin(pending, second);

  assert.equal(Object.keys(pending).length, 2);
  assert.equal(pending[iCloudPendingLoginKey("apple", "a@icloud.com")].pending_id, "pending-a");
  assert.equal(pending[iCloudPendingLoginKey("apple", "B@ICLOUD.COM")].pending_id, "pending-b");

  pending = removeICloudPendingLogin(pending, "apple", "A@ICLOUD.COM");
  assert.deepEqual(Object.keys(pending), [iCloudPendingLoginKey("apple", "b@icloud.com")]);
});
