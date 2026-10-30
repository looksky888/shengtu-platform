import assert from "node:assert/strict";
import test from "node:test";

import {
  isVideoChannelModelId,
  normalizeImageChannelModels,
  normalizePublicImageChannelModels,
  normalizeStringArray,
} from "../src/lib/model-catalog-normalizers.ts";

test("normalizes nullable resolution props used by the image composer", () => {
  assert.deepEqual(normalizeStringArray(null), []);
  assert.deepEqual(normalizeStringArray(["1k", null, "", 2, "4k"]), ["1k", "4k"]);
});

test("normalizes nullable channel model arrays from the public catalog", () => {
  const [model] = normalizePublicImageChannelModels(JSON.parse(JSON.stringify([{
    id: "channel-model-1",
    upstream_model: "gpt-image-2.5-4k",
    display_name: "GPT Image 2.5 4K",
    capabilities: null,
    resolutions: null,
    formats: null,
    credit_cost: 5,
  }])));

  assert.deepEqual(model.capabilities, []);
  assert.deepEqual(model.resolutions, []);
  assert.deepEqual(model.formats, []);
  assert.equal(model.upstream_model, "gpt-image-2.5-4k");
});

test("normalizes admin channel models when Grok video entries have null capabilities", () => {
  const models = normalizeImageChannelModels(JSON.parse(JSON.stringify([
    {
      id: "grok-image-1",
      channel_id: "local-grok-runtime",
      display_name: "grok-imagine-image",
      upstream_model: "grok-imagine-image",
      capabilities: ["generate", "edit"],
      resolutions: ["1k", "2k"],
      formats: ["png"],
      credit_cost: 2,
      credit_costs: { "1k": 2, "2k": 4 },
      enabled: true,
      sort: 10,
    },
    {
      id: "legacy-grok-video",
      channel_id: "local-grok-runtime",
      display_name: "",
      upstream_model: "grok-imagine-video",
      capabilities: null,
      resolutions: null,
      formats: null,
      credit_cost: 4,
      credit_costs: null,
      enabled: true,
      sort: 20,
    },
  ])));

  assert.equal(models.length, 2);
  assert.deepEqual(models[1].capabilities, []);
  assert.deepEqual(models[1].resolutions, []);
  assert.deepEqual(models[1].formats, []);
  assert.equal(models[1].display_name, "grok-imagine-video");
  assert.equal(models[1].credit_costs, undefined);
  assert.equal(isVideoChannelModelId(models[1].upstream_model), true);
  assert.equal(isVideoChannelModelId(models[0].upstream_model), false);
});

test("normalizes null catalog collections", () => {
  assert.deepEqual(normalizePublicImageChannelModels(null), []);
  assert.deepEqual(normalizePublicImageChannelModels(undefined), []);
  assert.deepEqual(normalizeImageChannelModels(null), []);
  assert.deepEqual(normalizeImageChannelModels(undefined), []);
});

test("video models with no image capability do not crash or alter relay routing and pricing", () => {
  const relay = {
    id: "relay-4k", channel_id: "relay", channel_name: "Relay", channel_type: "openai_compatible",
    upstream_model: "gpt-image-2.5-4k", display_name: "GPT Image 4K", capabilities: ["generate", "edit"],
    resolutions: ["1k"], formats: ["png"], credit_cost: 5, credit_costs: { "1k": 5 }, sort: 1, channel_sort: 2,
  };
  const models = normalizePublicImageChannelModels(JSON.parse(JSON.stringify([
    { ...relay, id: "video", upstream_model: "grok-imagine-video", capabilities: null, resolutions: null }, relay,
  ])));
  assert.deepEqual(models.filter((model) => model.capabilities.includes("generate")), [relay]);
});
