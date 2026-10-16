import assert from "node:assert/strict";
import test from "node:test";

import {
  availableICloudAccountIds,
  normalizeICloudAccountIds,
  parseICloudAccountSelection,
} from "../src/app/icloud/use-icloud-account-selection.ts";

test("iCloud account selection normalizes stored ids", () => {
  assert.deepEqual(normalizeICloudAccountIds([" account-a ", "account-a", "", null, "account-b"]), [
    "account-a",
    "account-b",
  ]);
  assert.deepEqual(parseICloudAccountSelection('["account-a","account-b"]'), ["account-a", "account-b"]);
  assert.deepEqual(parseICloudAccountSelection("not-json"), []);
});

test("iCloud account selection drops ids for removed sessions", () => {
  assert.deepEqual(
    availableICloudAccountIds(["account-a", "stale", "account-b"], [
      { account_id: "account-b" },
      { account_id: "account-a" },
    ]),
    ["account-a", "account-b"],
  );
});
