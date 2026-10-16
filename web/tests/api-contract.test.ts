import assert from "node:assert/strict";
import test from "node:test";

import { assertCursorPage, assertItemsResponse, assertOffsetPage } from "../src/lib/api-contract.ts";

test("list contract accepts canonical empty arrays", () => {
  const response: unknown = { items: [] };
  assert.doesNotThrow(() => assertItemsResponse(response, "列表"));
});

test("list contract rejects null items instead of hiding the server error", () => {
  assert.throws(() => assertItemsResponse({ items: null }, "列表"), /列表返回格式错误/);
});

test("cursor contract requires complete pagination metadata", () => {
  assert.doesNotThrow(() => assertCursorPage({ items: [], total: 0, has_more: false, next_cursor: "", limit: 50 }, "媒体库"));
  assert.throws(() => assertCursorPage({ items: [], total: 0, has_more: false, next_cursor: "" }, "媒体库"), /分页格式错误/);
});

test("offset contract requires page and page_size", () => {
  assert.doesNotThrow(() => assertOffsetPage({ items: [], total: 0, page: 1, page_size: 20 }, "账号列表"));
  assert.throws(() => assertOffsetPage({ items: [], total: 0, page: 1 }, "账号列表"), /分页格式错误/);
});
