import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LEGACY_VIDEO_TASK_KEY, videoTaskStorageKey } from "../src/app/video/video-task-storage.ts";
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
  assert.equal(LEGACY_VIDEO_TASK_KEY, "shengtu_last_video_task_id");
  assert.notEqual(videoTaskStorageKey(session("user-a")), videoTaskStorageKey(session("user-b")));
  assert.notEqual(videoTaskStorageKey(session("user-a", "local")), videoTaskStorageKey(session("user-a", "oauth")));
  assert.equal(videoTaskStorageKey(null), "");
});

test("video creation controller preserves quota refresh, RBAC cancel guard, and ?download=1 preview link", async () => {
  const controllerSource = await readFile(
    new URL("../src/app/video/use-video-creation.ts", import.meta.url),
    "utf8",
  );
  assert.match(controllerSource, /dispatchQuotaRefresh\(\)/);
  assert.match(controllerSource, /hasAPIPermission\(session,\s*"POST",\s*"\/api\/creation-tasks"\)/);

  const previewDialogSource = await readFile(
    new URL("../src/app/video/video-preview-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(previewDialogSource, /videoDownloadURL/);
  assert.match(previewDialogSource, /bg-\[#090b10\]/);
});
