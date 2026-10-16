import assert from "node:assert/strict";
import test from "node:test";

import { navItems, partitionNavItems } from "../src/components/top-nav-config.ts";

test("top navigation keeps creative libraries visible and settings reachable in overflow", () => {
  const { primary, overflow } = partitionNavItems(navItems);
  assert.deepEqual(primary.map((item) => item.href), ["/image", "/video", "/video-library", "/image-manager", "/recharge"]);
  assert.equal(primary.find((item) => item.href === "/video-library")?.accessPath, "/video");
  assert.equal(overflow.some((item) => item.href === "/settings"), true);
  assert.equal(new Set([...primary, ...overflow].map((item) => item.href)).size, navItems.length);
});
