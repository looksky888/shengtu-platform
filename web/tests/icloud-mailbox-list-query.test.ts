import assert from "node:assert/strict";
import test from "node:test";

import { buildICloudMailboxListQuery } from "../src/lib/icloud-mailbox-list-query.ts";

test("iCloud mailbox list query includes the selected usage filter", () => {
  assert.equal(
    buildICloudMailboxListQuery({ page: 2, page_size: 20, search: " demo ", usage: "used" }),
    "page=2&page_size=20&search=demo&usage=used",
  );
});

test("iCloud mailbox list query omits the all usage filter", () => {
  assert.equal(buildICloudMailboxListQuery({ page: 1, page_size: 20, usage: "all" }), "page=1&page_size=20");
});
