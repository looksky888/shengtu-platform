import assert from "node:assert/strict";
import test from "node:test";

import { requiresPaidAccountImageSize } from "../src/app/image/image-paid-size.ts";

test("detects image sizes that require a Paid account", () => {
  assert.equal(requiresPaidAccountImageSize("1824x1024"), true);
  assert.equal(requiresPaidAccountImageSize("1024×1824"), true);
  assert.equal(requiresPaidAccountImageSize("2048x2048"), true);
});

test("keeps standard image sizes available", () => {
  assert.equal(requiresPaidAccountImageSize("1024x1024"), false);
  assert.equal(requiresPaidAccountImageSize("1536x1024"), false);
  assert.equal(requiresPaidAccountImageSize("1024x1536"), false);
  assert.equal(requiresPaidAccountImageSize("auto"), false);
  assert.equal(requiresPaidAccountImageSize("16:9"), false);
});
