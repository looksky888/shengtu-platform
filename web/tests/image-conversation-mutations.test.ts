import assert from "node:assert/strict";
import test from "node:test";

import { removeImageTurn } from "../src/app/image/lib/image-conversation-mutations.ts";
import type { ImageConversation } from "../src/store/image-conversation-types.ts";

function conversation(): ImageConversation {
  return {
    id: "conversation-1",
    title: "第一条提示词",
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-28T10:02:00.000Z",
    turns: [
      {
        id: "turn-1",
        prompt: "第一条提示词",
        model: "gpt-image-2",
        mode: "generate",
        referenceImages: [],
        count: 1,
        size: "1024x1024",
        images: [{ id: "image-1", status: "success", url: "/media/image-1.png" }],
        createdAt: "2026-08-28T10:00:00.000Z",
        status: "success",
      },
      {
        id: "turn-2",
        prompt: "第二条提示词",
        model: "gpt-image-2",
        mode: "generate",
        referenceImages: [],
        count: 1,
        size: "1024x1024",
        images: [{ id: "image-2", status: "success", url: "/media/image-2.png" }],
        createdAt: "2026-08-28T10:02:00.000Z",
        status: "success",
      },
    ],
  };
}

test("removeImageTurn removes a non-first turn and preserves the conversation title", () => {
  const result = removeImageTurn(conversation(), "turn-2", "2026-08-28T10:03:00.000Z");

  assert.ok(result);
  assert.deepEqual(result.turns.map((turn) => turn.id), ["turn-1"]);
  assert.equal(result.title, "第一条提示词");
  assert.equal(result.updatedAt, "2026-08-28T10:03:00.000Z");
  assert.equal(result.turns[0].images[0].url, "/media/image-1.png");
});

test("removeImageTurn updates title when the first turn is removed", () => {
  const result = removeImageTurn(conversation(), "turn-1", "2026-08-28T10:03:00.000Z");

  assert.ok(result);
  assert.deepEqual(result.turns.map((turn) => turn.id), ["turn-2"]);
  assert.equal(result.title, "第二条提示词");
});

test("removeImageTurn keeps an empty conversation when its only turn is removed", () => {
  const source = conversation();
  source.turns = [source.turns[0]];

  const result = removeImageTurn(source, "turn-1", "2026-08-28T10:03:00.000Z");

  assert.ok(result);
  assert.deepEqual(result.turns, []);
  assert.equal(result.title, "新建对话");
});

test("removeImageTurn returns null for an unknown turn", () => {
  assert.equal(removeImageTurn(conversation(), "missing", "2026-08-28T10:03:00.000Z"), null);
});
