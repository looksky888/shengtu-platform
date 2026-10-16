import assert from "node:assert/strict";
import test from "node:test";

import { formatMailboxAPICopyText } from "../src/app/icloud/icloud-mailbox-copy.ts";

test("iCloud mailbox API copy combines email and an absolute public API URL", () => {
  assert.equal(
    formatMailboxAPICopyText(
      { email: "example@icloud.com", api_url: "/api/icloud/public/mailbox/token" },
      "https://shengtu.example",
    ),
    "example@icloud.com----https://shengtu.example/api/icloud/public/mailbox/token",
  );
});

test("iCloud mailbox API copy preserves absolute URLs and trims source fields", () => {
  assert.equal(
    formatMailboxAPICopyText(
      { email: "  example@icloud.com ", api_url: " https://api.example/mail/token " },
      "https://shengtu.example",
    ),
    "example@icloud.com----https://api.example/mail/token",
  );
});

test("iCloud mailbox API copy rejects incomplete rows", () => {
  assert.equal(formatMailboxAPICopyText({ email: "example@icloud.com" }, "https://shengtu.example"), "");
  assert.equal(formatMailboxAPICopyText({ api_url: "/api/mail" }, "https://shengtu.example"), "");
});
