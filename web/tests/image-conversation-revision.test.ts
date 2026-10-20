import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceConversationRevision,
  conversationRevision,
  pickLatestConversation,
  touchConversation,
} from "../src/store/image-conversation-revision.ts";
import type { ImageConversation } from "../src/store/image-conversation-types.ts";

function conversation(overrides: Partial<ImageConversation> = {}): ImageConversation {
  return {
    id: "conversation-1",
    title: "提示词",
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-28T10:00:00.000Z",
    revision: 0,
    turns: [
      {
        id: "turn-1",
        prompt: "提示词",
        model: "gpt-image-2",
        mode: "generate",
        referenceImages: [],
        count: 1,
        size: "1024x1024",
        images: [{ id: "image-1", status: "loading" }],
        createdAt: "2026-08-28T10:00:00.000Z",
        status: "queued",
      },
    ],
    ...overrides,
  };
}

test("touchConversation advances the revision and stamps the display time", () => {
  const touched = touchConversation(conversation({ revision: 4 }), {}, "2026-08-28T11:00:00.000Z");

  assert.equal(touched.revision, 5);
  assert.equal(touched.updatedAt, "2026-08-28T11:00:00.000Z");
});

test("legacy payloads without a revision read as 0", () => {
  const legacy = { ...conversation(), revision: undefined } as unknown as ImageConversation;

  assert.equal(conversationRevision(legacy), 0);
  assert.equal(advanceConversationRevision(legacy).revision, 1);
});

test("fresh content with a stale updatedAt still wins over a later timestamped write", () => {
  // markTurnTasksGenerating writes taskId / generating with an unstamped updatedAt; it used to
  // be dropped wholesale as soon as any other path pushed updatedAt further out.
  const stored = conversation({ revision: 4, updatedAt: "2026-08-28T12:00:00.000Z" });
  const generating = touchConversation(
    conversation({ revision: 4, updatedAt: "2026-08-28T10:00:00.000Z" }),
    {},
    "2026-08-28T10:00:00.000Z",
  );

  assert.equal(generating.revision, 5);
  assert.equal(pickLatestConversation(stored, generating), generating);
});

test("a write built from an older revision loses to the stored conversation", () => {
  const stored = conversation({ revision: 7, updatedAt: "2026-08-28T10:00:00.000Z" });
  const staleWrite = advanceConversationRevision(conversation({ revision: 3, updatedAt: "2026-08-28T13:00:00.000Z" }));

  assert.equal(staleWrite.revision, 4);
  assert.equal(pickLatestConversation(stored, staleWrite), stored);
});

test("equal revisions still arbitrate by updatedAt", () => {
  const earlier = conversation({ revision: 2, updatedAt: "2026-08-28T10:00:00.000Z" });
  const later = conversation({ revision: 2, updatedAt: "2026-08-28T10:05:00.000Z" });

  assert.equal(pickLatestConversation(earlier, later), later);
  assert.equal(pickLatestConversation(later, earlier), later);
});
