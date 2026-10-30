import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUnifiedVideoTakes,
  EXPIRED_VIDEO_TASK_MESSAGE,
  isTerminalVideoStatus,
  markMissingVideoTakesError,
  MAX_RECENT_VIDEO_TAKES,
  removeRecentVideoTake,
  upsertRecentVideoTake,
  videoTaskStorageKey,
  type RecentVideoTake,
  type SubmittedVideoMeta,
} from "../src/app/video/video-task-storage.ts";
import type { CreationTask } from "../src/lib/image-task-types.ts";
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

function makeTake(id: string, overrides: Partial<RecentVideoTake> = {}): RecentVideoTake {
  return {
    taskId: id,
    prompt: `镜头 ${id}`,
    ratio: "16:9",
    size: "1280x720",
    seconds: 6,
    resolutionName: "720p",
    preset: "custom",
    model: "grok-imagine-video-1.5",
    status: "success",
    createdAt: "2026-10-30T12:00:00Z",
    ...overrides,
  };
}

function makeCreationTask(id: string, status: CreationTask["status"]): CreationTask {
  return {
    id,
    kind: "video",
    status,
    created: 1730000000,
    updated: 1730000010,
  };
}

test("video recovery keys are isolated by provider and subject", () => {
  assert.notEqual(videoTaskStorageKey(session("user-a")), videoTaskStorageKey(session("user-b")));
  assert.notEqual(videoTaskStorageKey(session("user-a", "local")), videoTaskStorageKey(session("user-a", "oauth")));
  assert.equal(videoTaskStorageKey(null), "");
});

test("video recent takes support up to 30 storyboard shots and clean removal", () => {
  assert.equal(MAX_RECENT_VIDEO_TAKES, 30);

  let takes: RecentVideoTake[] = [];
  for (let index = 1; index <= 35; index += 1) {
    takes = upsertRecentVideoTake(takes, makeTake(`take-${index}`), { moveToFront: true });
  }
  assert.equal(takes.length, 30);
  assert.equal(takes[0]?.taskId, "take-35");

  const updated = upsertRecentVideoTake(takes, makeTake("take-35", { prompt: "", videoUrl: "/v/35.mp4" }));
  assert.equal(updated[0]?.prompt, "镜头 take-35");
  assert.equal(updated[0]?.videoUrl, "/v/35.mp4");

  const afterRemove = removeRecentVideoTake(updated, "take-35");
  assert.equal(afterRemove.length, 29);
  assert.equal(afterRemove.some((item) => item.taskId === "take-35"), false);
});

test("terminal video statuses are never resurrected after card deletion or history clear", () => {
  assert.equal(isTerminalVideoStatus("queued"), false);
  assert.equal(isTerminalVideoStatus("running"), false);
  assert.equal(isTerminalVideoStatus("success"), true);
  assert.equal(isTerminalVideoStatus("error"), true);
  assert.equal(isTerminalVideoStatus("cancelled"), true);

  const meta: SubmittedVideoMeta = {
    taskId: "video-99",
    prompt: "原始提交提示词",
    ratio: "16:9",
    size: "1280x720",
    seconds: 10,
    resolutionName: "720p",
    preset: "custom",
    model: "grok-imagine-video-1.5",
    createdAt: "2026-10-30T12:00:00Z",
  };

  for (const terminalStatus of ["success", "error", "cancelled"] as const) {
    const unifiedAfterDelete = buildUnifiedVideoTakes(
      [],
      makeCreationTask("video-99", terminalStatus),
      meta,
    );
    assert.deepEqual(unifiedAfterDelete, []);
  }

  // Active live task uses frozen submittedMeta snapshot rather than live composer inputs
  const unifiedWhileRunning = buildUnifiedVideoTakes(
    [],
    makeCreationTask("video-99", "running"),
    meta,
  );
  assert.equal(unifiedWhileRunning.length, 1);
  assert.equal(unifiedWhileRunning[0]?.prompt, "原始提交提示词");
  assert.equal(unifiedWhileRunning[0]?.seconds, 10);
});

test("markMissingVideoTakesError marks evicted active video tasks as error without touching terminal takes", () => {
  const initial: RecentVideoTake[] = [
    makeTake("queued-evicted", { status: "queued" }),
    makeTake("running-evicted", { status: "running" }),
    makeTake("already-done", { status: "success", videoUrl: "/v/done.mp4" }),
  ];

  const { takes, changed } = markMissingVideoTakesError(initial, [
    "queued-evicted",
    "running-evicted",
    "already-done",
  ]);
  assert.equal(changed, true);
  assert.equal(takes[0]?.status, "error");
  assert.equal(takes[0]?.error, EXPIRED_VIDEO_TASK_MESSAGE);
  assert.equal(takes[1]?.status, "error");
  assert.equal(takes[1]?.error, EXPIRED_VIDEO_TASK_MESSAGE);
  assert.equal(takes[2]?.status, "success");
  assert.equal(takes[2]?.error, undefined);

  const secondPass = markMissingVideoTakesError(takes, ["queued-evicted"]);
  assert.equal(secondPass.changed, false);
});
