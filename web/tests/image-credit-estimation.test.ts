import assert from "node:assert/strict";
import test from "node:test";

import { estimatedCreditsPerImageForModel } from "../src/app/image/lib/image-credit-estimation.ts";

test("uses independent GPT sub-model credit costs matching backend imageCreditBaseAmount", () => {
  const costs = {
    "1080p": 1,
    "2k": 2,
    "4k": 3,
    gptImage2: 11,
    gptImage25: 12,
    gptImage25Flare: 13,
    gptImage25Sunburst: 14,
    grok1k: 4,
    grok2k: 8,
  };

  assert.equal(estimatedCreditsPerImageForModel("gpt-image-2", "1k", "1024x1024", costs), 11);
  assert.equal(estimatedCreditsPerImageForModel("gpt-image-2.5", "1k", "1024x1024", costs), 12);
  assert.equal(estimatedCreditsPerImageForModel("gpt-image-2.5-flare", "1k", "1024x1024", costs), 13);
  assert.equal(estimatedCreditsPerImageForModel("gpt-image-2.5-sunburst", "1k", "1024x1024", costs), 14);
  assert.equal(estimatedCreditsPerImageForModel("grok-imagine-image", "1k", "1024x1024", costs), 4);
  assert.equal(estimatedCreditsPerImageForModel("grok-imagine-image", "2k", "1792x1024", costs), 8);
});

test("falls back to resolution or pixel size tiers for custom models", () => {
  const costs = {
    "1080p": 2,
    "2k": 5,
    "4k": 9,
    gptImage2: 11,
    gptImage25: 12,
    gptImage25Flare: 13,
    gptImage25Sunburst: 14,
    grok1k: 4,
    grok2k: 8,
  };

  assert.equal(estimatedCreditsPerImageForModel("flux-pro", "1k", "1024x1024", costs), 2);
  assert.equal(estimatedCreditsPerImageForModel("flux-pro", "2k", "2048x2048", costs), 5);
  assert.equal(estimatedCreditsPerImageForModel("flux-pro", "1k", "4096x4096", costs), 9);
});
