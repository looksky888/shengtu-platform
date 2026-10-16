import assert from "node:assert/strict";
import test from "node:test";

import { resolveICloudCodeKeyword } from "../src/app/icloud/icloud-code-platform.ts";

test("iCloud code platform resolves built-in keywords", () => {
  assert.equal(resolveICloudCodeKeyword("auto"), "auto");
  assert.equal(resolveICloudCodeKeyword("openai"), "provider:openai");
  assert.equal(resolveICloudCodeKeyword("grok"), "provider:grok");
  assert.equal(resolveICloudCodeKeyword("higgsfield"), "provider:higgsfield");
});

test("iCloud code platform trims custom sender keyword", () => {
  assert.equal(resolveICloudCodeKeyword("custom", "  Canva  "), "Canva");
  assert.equal(resolveICloudCodeKeyword("custom", "   "), "");
});
