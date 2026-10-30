import assert from "node:assert/strict";
import test from "node:test";

import { buildComposerRecallState } from "../src/app/image/lib/image-turn-recall.ts";
import type { ImageTurn } from "../src/store/image-conversation-types.ts";

test("history edit recalls prompt and generation settings into the composer", () => {
  const turn: ImageTurn = {
    id: "turn-1",
    prompt: "保留人物发型，改成电影光影",
    model: "gpt-image-2",
    mode: "edit",
    referenceImages: [{ name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,abc" }],
    count: 3,
    size: "1536x1024",
    sizeSelection: { mode: "custom", aspectRatio: "", resolution: "auto", customWidth: "1536", customHeight: "1024" },
    quality: "high",
    outputFormat: "webp",
    outputCompression: 82,
    visibility: "public",
    images: [{ id: "image-1", status: "success", url: "/images/2026/08/result.webp" }],
    createdAt: "2026-08-27T13:19:00+08:00",
    status: "success",
  };

  const recalled = buildComposerRecallState(turn, "gpt-image-2", "gpt-5-5-thinking");

  assert.equal(recalled.prompt, turn.prompt);
  assert.equal(recalled.composerMode, "image");
  assert.equal(recalled.model, turn.model);
  assert.equal(recalled.count, "3");
  assert.equal(recalled.sizeSelection.customWidth, "1536");
  assert.equal(recalled.quality, "high");
  assert.equal(recalled.outputFormat, "webp");
  assert.equal(recalled.outputCompression, "82");
  assert.equal(recalled.visibility, "public");
  assert.deepEqual(recalled.referenceImages, turn.referenceImages);
});

test("history edit recalls up to 15 images and clamps higher counts to 15", () => {
  const baseTurn: ImageTurn = {
    id: "turn-15",
    prompt: "生成 15 张角色三视图",
    model: "gpt-image-2.5",
    mode: "generate",
    referenceImages: [],
    count: 15,
    size: "1024x1024",
    quality: "high",
    outputFormat: "png",
    visibility: "private",
    images: [],
    createdAt: "2026-10-30T12:00:00+08:00",
    status: "success",
  };

  assert.equal(buildComposerRecallState(baseTurn, "gpt-image-2.5", "gpt-5-5-thinking").count, "15");
  assert.equal(
    buildComposerRecallState({ ...baseTurn, count: 24 }, "gpt-image-2.5", "gpt-5-5-thinking").count,
    "15",
  );
});
