import assert from "node:assert/strict";
import test from "node:test";

import { resolveImageTaskRoute } from "../src/app/image/lib/creation-task-route-rules.ts";

test("text-only image composer uses image generation route", () => {
  assert.equal(resolveImageTaskRoute("image", false, false, false), "image-generations");
  assert.equal(resolveImageTaskRoute("generate", false, false, false), "image-generations");
});

test("reference images and explicit edit mode use image edit route", () => {
  assert.equal(resolveImageTaskRoute("image", false, true, false), "image-edits");
  assert.equal(resolveImageTaskRoute("edit", false, false, false), "image-edits");
  assert.equal(resolveImageTaskRoute("image", false, false, true), "image-edits");
});

test("chat and response image routes keep their dedicated handlers", () => {
  assert.equal(resolveImageTaskRoute("chat", true, false, false), "chat");
  assert.equal(resolveImageTaskRoute("image", true, false, false), "response-image");
});
