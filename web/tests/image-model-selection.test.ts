import assert from "node:assert/strict";
import test from "node:test";

import { resolveImageModel } from "../src/app/image/lib/image-model-selection.ts";

const knownImageModel = (value: string) => value === "gpt-image-2.5-flare";

test("configured channel model keeps a dynamic upstream id", () => {
  assert.equal(
    resolveImageModel({
      mode: "image",
      requestedModel: "gpt-image-2.5-4k",
      channelModelId: "relay-model-4k",
      defaultModel: "gpt-image-2.5-flare",
      isKnownModel: knownImageModel,
    }),
    "gpt-image-2.5-4k",
  );
});

test("unknown image model without a channel still falls back", () => {
  assert.equal(
    resolveImageModel({
      mode: "image",
      requestedModel: "gpt-image-2.5-4k",
      defaultModel: "gpt-image-2.5-flare",
      isKnownModel: knownImageModel,
    }),
    "gpt-image-2.5-flare",
  );
});

test("chat model validation does not accept a channel override", () => {
  assert.equal(
    resolveImageModel({
      mode: "chat",
      requestedModel: "unknown-chat",
      channelModelId: "relay-model",
      defaultModel: "gpt-5-5-thinking",
      isKnownModel: () => false,
    }),
    "gpt-5-5-thinking",
  );
});
