import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_MODEL_OPTIONS,
  IMAGE_CREATION_MODEL_OPTIONS,
  VIDEO_CREATION_MODEL_OPTIONS,
  isGrokChatModel,
  isGrokImageModel,
  isImageCreationModel,
  isVideoCreationModel,
  filterStudioImageModelIds,
  normalizeChatModelId,
} from "../src/lib/api-models.ts";

test("model catalog separates Grok chat and image routes", () => {
  assert.equal(isGrokChatModel("grok-4.5"), true);
  assert.equal(isGrokChatModel("grok-4.20-fast"), true);
  assert.equal(isGrokImageModel("grok-imagine-image-edit"), true);
  assert.deepEqual(IMAGE_CREATION_MODEL_OPTIONS.map((item) => item.value), [
    "gpt-image-2.5-flare",
    "gpt-image-2.5",
    "gpt-image-2",
    "gpt-image-2.5-sunburst",
    "grok-imagine-image",
  ]);
  assert.deepEqual(IMAGE_CREATION_MODEL_OPTIONS.map((item) => item.label), [
    "GPT Images 2.5 Flare",
    "GPT Images 2.5",
    "GPT Images 2",
    "GPT Images 2.5 Sunburst",
    "grok-imagine-image",
  ]);
});

test("studio catalog exposes Grok video without classifying it as an image task", () => {
  assert.deepEqual(VIDEO_CREATION_MODEL_OPTIONS.map((item) => item.value), [
    "grok-imagine-video",
    "grok-imagine-video-1.5",
  ]);
  assert.equal(isVideoCreationModel("grok-imagine-video"), true);
  assert.equal(isVideoCreationModel("grok-imagine-video-1.5"), true);
  assert.equal(isImageCreationModel("grok-imagine-video"), false);
  assert.equal(isImageCreationModel("grok-imagine-video-1.5"), false);
});

test("model catalog keeps OAuth warning and canonical chat aliases", () => {
  const grok45 = CHAT_MODEL_OPTIONS.find((item) => item.value === "grok-4.5");
  assert.match(grok45?.label ?? "", /OAuth/);
  assert.equal(normalizeChatModelId(" gpt-5.5 "), "gpt-5-5");
  assert.equal(new Set(CHAT_MODEL_OPTIONS.map((item) => item.value)).size, CHAT_MODEL_OPTIONS.length);
});

test("dynamic image catalog removes video, edit, lite/pro and text variants", () => {
  assert.deepEqual(
    filterStudioImageModelIds([
      "GROK-IMAGINE-IMAGE",
      "grok-imagine-image-edit",
      "grok-imagine-image-lite",
      "grok-imagine-image-pro",
      "grok-imagine-video",
      "gpt-5-5",
      "gpt-image-2.5-flare",
      "gpt-image-2.5-flare",
      "",
      null,
    ]),
    ["grok-imagine-image", "gpt-image-2.5-flare"],
  );
});
