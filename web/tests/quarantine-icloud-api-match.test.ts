import assert from "node:assert/strict";
import test from "node:test";

import { formatMailboxAPICopyText } from "../src/app/icloud/icloud-mailbox-copy.ts";
import { matchPermanentQuarantineMailboxAPIs } from "../src/app/task-queue/quarantine-icloud-api-match.ts";

test("permanent quarantine matching preserves order and classifies missing or inactive APIs", async () => {
  const result = await matchPermanentQuarantineMailboxAPIs(
    [
      { grade: "temporary", email: "temporary@icloud.com" },
      { grade: "permanent", email: " First@icloud.com " },
      { grade: "permanent", email: "missing@icloud.com" },
      { grade: "permanent", email: "inactive@icloud.com" },
      { grade: "permanent", email: "first@icloud.com" },
      { grade: "permanent" },
    ],
    "https://shengtu.example",
    async (emails) => {
      assert.deepEqual(emails, ["First@icloud.com", "missing@icloud.com", "inactive@icloud.com"]);
      return {
        success: true,
        mailboxes: [
          { email: "first@icloud.com", api_url: "/api/icloud/public/first/code?key=one", api_active: true },
          { email: "inactive@icloud.com", api_url: "/api/icloud/public/inactive/code?key=two", api_active: false },
        ],
        missing: ["missing@icloud.com"],
      };
    },
    formatMailboxAPICopyText,
  );

  assert.equal(result.permanentCount, 5);
  assert.equal(result.requestedCount, 3);
  assert.equal(result.withoutEmailCount, 1);
  assert.deepEqual(result.missing, ["missing@icloud.com"]);
  assert.deepEqual(result.apiUnavailable, ["inactive@icloud.com"]);
  assert.equal(
    result.copyText,
    "first@icloud.com----https://shengtu.example/api/icloud/public/first/code?key=one",
  );
});

test("permanent quarantine matching splits more than 500 unique emails into bounded batches", async () => {
  const items = Array.from({ length: 501 }, (_, index) => ({
    grade: "permanent",
    email: `user-${index}@icloud.com`,
  }));
  const batchSizes: number[] = [];
  const result = await matchPermanentQuarantineMailboxAPIs(
    items,
    "https://shengtu.example",
    async (emails) => {
      batchSizes.push(emails.length);
      return {
        success: true,
        mailboxes: emails.map((email) => ({ email, api_url: `/api/code/${email}` })),
        missing: [],
      };
    },
    formatMailboxAPICopyText,
  );

  assert.deepEqual(batchSizes, [500, 1]);
  assert.equal(result.matched.length, 501);
  assert.equal(result.copyText.split("\n").length, 501);
});
