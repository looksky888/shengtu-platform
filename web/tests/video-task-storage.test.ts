import assert from "node:assert/strict";
import test from "node:test";

import { videoTaskStorageKey } from "../src/app/video/video-task-storage.ts";
import type { StoredAuthSession } from "../src/store/auth.ts";

function session(subjectId: string, provider = "local"): StoredAuthSession {
  return {
    key: `token-${subjectId}`,
    role: "user",
    subjectId,
    name: subjectId,
    provider,
    menuPaths: [],
    apiPermissions: [],
    menus: [],
  };
}

test("video recovery keys are isolated by provider and subject", () => {
  assert.notEqual(videoTaskStorageKey(session("user-a")), videoTaskStorageKey(session("user-b")));
  assert.notEqual(videoTaskStorageKey(session("user-a", "local")), videoTaskStorageKey(session("user-a", "oauth")));
  assert.equal(videoTaskStorageKey(null), "");
});
