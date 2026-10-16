import assert from "node:assert/strict";
import test from "node:test";

import { preserveEphemeralReferenceImages } from "../src/store/image-conversation-ephemeral.ts";
import type { ImageConversation, ImageTurn } from "../src/store/image-conversation-types.ts";

function makeTurn(overrides: Partial<ImageTurn> = {}): ImageTurn {
  return {
    id: "turn-1",
    prompt: "adjust colors",
    model: "gpt-image-2",
    mode: "image",
    referenceImages: [],
    count: 1,
    size: "1024x1024",
    images: [{ id: "image-1", status: "loading" }],
    createdAt: "2026-08-14T00:00:00.000Z",
    status: "queued",
    ...overrides,
  };
}

function makeConversation(turn: ImageTurn): ImageConversation {
  return {
    id: "conversation-1",
    title: "adjust colors",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    turns: [turn],
  };
}

test("same-page persistence refresh keeps full reference preview while applying stored task state", () => {
  const currentReference = {
    name: "large-reference.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,full-session-preview",
    source: "upload" as const,
  };
  const current = makeConversation(makeTurn({ referenceImages: [currentReference] }));
  const persisted = makeConversation(makeTurn({ status: "generating", referenceImages: [] }));

  const [merged] = preserveEphemeralReferenceImages([persisted], [current]);

  assert.equal(merged.turns[0].status, "generating");
  assert.deepEqual(merged.turns[0].referenceImages, [currentReference]);
});

test("persistence refresh does not restore conversations that were deleted", () => {
  const current = makeConversation(
    makeTurn({
      referenceImages: [{ name: "reference.png", type: "image/png", dataUrl: "data:image/png;base64,x" }],
    }),
  );

  assert.deepEqual(preserveEphemeralReferenceImages([], [current]), []);
});
