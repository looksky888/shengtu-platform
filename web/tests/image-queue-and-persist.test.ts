import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildComposerRecallState } from "../src/app/image/lib/image-turn-recall.ts";
import {
  conversationForPersistence,
  MAX_CONVERSATION_DATA_URL_LENGTH,
  MAX_PERSISTED_DATA_URL_LENGTH,
} from "../src/store/image-conversation-persist.ts";
import type { ImageConversation, ImageTurn } from "../src/store/image-conversation-types.ts";

(globalThis as Record<string, unknown>).__APP_VERSION__ = "4.5.0-test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcRootUrl = pathToFileURL(path.join(testDir, "..", "src") + path.sep).href;

register(
  `data:text/javascript,${encodeURIComponent(`
    import fs from "node:fs";
    import { fileURLToPath } from "node:url";
    const srcRoot = ${JSON.stringify(srcRootUrl)};
    function tryCandidates(baseUrl) {
      for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const candidateUrl = baseUrl + suffix;
        try {
          if (fs.statSync(fileURLToPath(candidateUrl)).isFile()) {
            return candidateUrl;
          }
        } catch {}
      }
      return null;
    }
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "localforage") {
        return {
          shortCircuit: true,
          url: "data:text/javascript," + encodeURIComponent(\`
            const mem = new Map();
            const store = {
              getItem: async (k) => mem.get(k) ?? null,
              setItem: async (k, v) => { mem.set(k, v); return v; },
              removeItem: async (k) => { mem.delete(k); },
            };
            export default { ...store, createInstance: () => store };
          \`),
        };
      }
      if (specifier.startsWith("@/")) {
        const found = tryCandidates(new URL(specifier.slice(2), srcRoot).href);
        if (found) return nextResolve(found, context);
      } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        const found = tryCandidates(new URL(specifier, context.parentURL).href);
        if (found) return nextResolve(found, context);
      }
      return nextResolve(specifier, context);
    }
    export async function load(url, context, nextLoad) {
      if (url.endsWith("/constants/common-env.ts")) {
        return {
          format: "module",
          shortCircuit: true,
          source: 'export default { apiUrl: "", appVersion: "4.5.0-test", isDev: false };',
        };
      }
      return nextLoad(url, context);
    }
  `)}`,
);

function readWebSource(relativePath: string): string {
  return fs.readFileSync(path.join(testDir, "..", "src", relativePath), "utf8");
}

function makeTurn(overrides: Partial<ImageTurn> = {}): ImageTurn {
  return {
    id: "turn-1",
    prompt: "给主体替换赛博霓虹背景",
    model: "gpt-image-2.6-flare",
    mode: "edit",
    referenceImages: [],
    count: 1,
    size: "1024x1024",
    images: [{ id: "turn-1-image-0", status: "loading" }],
    createdAt: "2026-11-15T00:00:00.000Z",
    status: "queued",
    ...overrides,
  };
}

function makeConversation(turns: ImageTurn[]): ImageConversation {
  return {
    id: "conv-1",
    title: "改图会话",
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
    turns,
  };
}

test("[FUNC-1] IndexedDB persistence keeps normal reference uploads intact and preserves stripped metadata over budget", () => {
  assert.equal(MAX_PERSISTED_DATA_URL_LENGTH, 2_500_000);
  assert.equal(MAX_CONVERSATION_DATA_URL_LENGTH, 8_000_000);

  const normalDataUrl = `data:image/png;base64,${"A".repeat(320_000)}`;
  const oversizedDataUrl = `data:image/webp;base64,${"B".repeat(MAX_PERSISTED_DATA_URL_LENGTH + 128)}`;

  const persisted = conversationForPersistence(
    makeConversation([
      makeTurn({
        id: "turn-normal-and-oversized",
        referenceImages: [
          {
            id: "ref-normal",
            name: "mask.png",
            type: "image/png",
            mimeType: "image/png",
            dataUrl: normalDataUrl,
            source: "upload",
          },
          {
            id: "ref-huge",
            name: "raw-scan.webp",
            type: "image/webp",
            mimeType: "image/webp",
            dataUrl: oversizedDataUrl,
            source: "upload",
          },
        ],
      }),
    ]),
  );

  const [keptRef, strippedRef] = persisted.turns[0].referenceImages;
  assert.equal(keptRef.dataUrl, normalDataUrl);
  assert.equal(keptRef.stripped, undefined);

  assert.equal(strippedRef.id, "ref-huge");
  assert.equal(strippedRef.name, "raw-scan.webp");
  assert.equal(strippedRef.mimeType, "image/webp");
  assert.equal(strippedRef.source, "upload");
  assert.equal(strippedRef.dataUrl, "");
  assert.equal(strippedRef.stripped, true);
});

test("[FUNC-1] IndexedDB persistence prioritizes recent turns within the 8M conversation budget", () => {
  const chunk2M = `data:image/png;base64,${"C".repeat(2_200_000)}`;
  const persisted = conversationForPersistence(
    makeConversation([
      makeTurn({
        id: "turn-oldest",
        referenceImages: [{ id: "ref-1", name: "old-1.png", type: "image/png", dataUrl: chunk2M }],
      }),
      makeTurn({
        id: "turn-2",
        referenceImages: [{ id: "ref-2", name: "recent-2.png", type: "image/png", dataUrl: chunk2M }],
      }),
      makeTurn({
        id: "turn-3",
        referenceImages: [{ id: "ref-3", name: "recent-3.png", type: "image/png", dataUrl: chunk2M }],
      }),
      makeTurn({
        id: "turn-newest",
        referenceImages: [{ id: "ref-4", name: "newest-4.png", type: "image/png", dataUrl: chunk2M }],
      }),
    ]),
  );

  // 3 * 2.2M = 6.6M <= 8M kept for the 3 newest turns; 4th oldest exceeds 8M and is marked stripped
  assert.equal(persisted.turns[3].referenceImages[0].dataUrl, chunk2M);
  assert.equal(persisted.turns[2].referenceImages[0].dataUrl, chunk2M);
  assert.equal(persisted.turns[1].referenceImages[0].dataUrl, chunk2M);
  assert.equal(persisted.turns[0].referenceImages[0].dataUrl, "");
  assert.equal(persisted.turns[0].referenceImages[0].stripped, true);
  assert.equal(persisted.turns[0].referenceImages[0].name, "old-1.png");
});

test("[FUNC-1] normalizeConversation & recall preserve stripped metadata, edit mode, and filter empty dataUrls", async () => {
  const { normalizeConversation } = await import("../src/store/image-conversation-normalize.ts");

  const rawPersisted = conversationForPersistence(
    makeConversation([
      makeTurn({
        id: "turn-edit-stripped",
        mode: "edit",
        referenceImages: [
          {
            id: "ref-oversized",
            name: "portrait.png",
            type: "image/png",
            mimeType: "image/png",
            dataUrl: `data:image/png;base64,${"D".repeat(MAX_PERSISTED_DATA_URL_LENGTH + 50)}`,
            source: "upload",
          },
          {
            id: "ref-valid",
            name: "style.png",
            type: "image/png",
            dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            source: "conversation",
          },
        ],
      }),
    ]),
  );

  const normalized = normalizeConversation(rawPersisted as ImageConversation & Record<string, unknown>);
  const turn = normalized.turns[0];
  assert.equal(turn.mode, "edit");
  assert.equal(turn.referenceImages.length, 2);
  assert.equal(turn.referenceImages[0].stripped, true);
  assert.equal(turn.referenceImages[0].id, "ref-oversized");
  assert.equal(turn.referenceImages[0].name, "portrait.png");
  assert.equal(turn.referenceImages[0].mimeType, "image/png");
  assert.equal(turn.referenceImages[0].dataUrl, "");

  const recalled = buildComposerRecallState(turn, "gpt-image-2.6-flare", "gpt-5.4");
  assert.equal(recalled.referenceImages.length, 1);
  assert.equal(recalled.referenceImages[0].id, "ref-valid");
});

test("[FUNC-1] already-submitted tasks skip buildPendingTaskGroups and go straight to polling on remount/reload", async () => {
  const {
    applyCreationTasksToConversation,
    buildPendingTaskGroups,
    getLoadingTaskIds,
    markTurnTasksGenerating,
  } = await import("../src/app/image/lib/image-queue-utils.ts");
  const { recoverConversationHistory } = await import("../src/app/image/lib/conversation-task-sync.ts");

  // Already-submitted edit turn reloaded after reference image was stripped
  const inFlightSubmittedTurn = makeTurn({
    id: "turn-inflight",
    mode: "edit",
    status: "generating",
    referenceImages: [
      { id: "ref-1", name: "subject.png", type: "image/png", mimeType: "image/png", dataUrl: "", stripped: true },
    ],
    images: [{ id: "turn-inflight-image-0", taskId: "turn-inflight-task-0", status: "loading" }],
  });

  assert.deepEqual(buildPendingTaskGroups(inFlightSubmittedTurn), []);
  assert.deepEqual(getLoadingTaskIds(inFlightSubmittedTurn), ["turn-inflight-task-0"]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const recovered = await recoverConversationHistory([makeConversation([inFlightSubmittedTurn])]);
    assert.equal(recovered[0].turns[0].status, "generating");
    assert.equal(recovered[0].turns[0].images[0].status, "loading");
    assert.equal(recovered[0].turns[0].images[0].taskId, "turn-inflight-task-0");

    // Unsubmitted edit turn with stripped reference image surfaces clear Chinese hint instead of crashing
    const unsubmittedStripped = await recoverConversationHistory([
      makeConversation([
        makeTurn({
          id: "turn-unsubmitted-stripped",
          mode: "edit",
          status: "queued",
          referenceImages: [{ name: "huge.png", type: "image/png", dataUrl: "", stripped: true }],
          images: [{ id: "turn-unsubmitted-stripped-image-0", status: "loading" }],
        }),
      ]),
    ]);
    assert.equal(unsubmittedStripped[0].turns[0].status, "error");
    assert.equal(unsubmittedStripped[0].turns[0].images[0].error, "参考图较大未缓存，重试需重新上传");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Unsubmitted turn with valid reference image stays queued/generating without pre-stamping taskId
  const freshConv = makeConversation([
    makeTurn({
      id: "turn-fresh",
      mode: "edit",
      status: "queued",
      referenceImages: [{ name: "ok.png", type: "image/png", dataUrl: "data:image/png;base64,abc" }],
      images: [{ id: "turn-fresh-image-0", status: "loading" }],
    }),
  ]);
  const marked = markTurnTasksGenerating(freshConv, "turn-fresh");
  assert.equal(marked.turns[0].images[0].taskId, undefined);
  assert.deepEqual(buildPendingTaskGroups(marked.turns[0]), [{ taskId: "turn-fresh-task-0", count: 1 }]);

  const afterSubmit = applyCreationTasksToConversation(marked, "turn-fresh", [
    {
      id: "turn-fresh-task-0",
      kind: "image",
      status: "running",
      created_at: "2026-11-15T00:00:01Z",
      updated_at: "2026-11-15T00:00:01Z",
    },
  ]);
  assert.equal(afterSubmit.turns[0].images[0].taskId, "turn-fresh-task-0");
  assert.deepEqual(buildPendingTaskGroups(afterSubmit.turns[0]), []);

  const runnerSource = readWebSource("app/image/hooks/use-image-queue-runner.ts");
  const promptCardSource = readWebSource("app/image/components/image-turn-prompt-card.tsx");
  const recallHookSource = readWebSource("app/image/hooks/use-image-turn-recall-action.ts");

  assert.match(runnerSource, /if \(unsubmittedGroups\.length > 0\)/);
  assert.match(promptCardSource, /参考图较大未缓存，重试需重新上传/);
  assert.match(recallHookSource, /原参考图未缓存，请重新添加参考图/);
});

test("[FUNC-1] < 2s route-switch owner token supersedes stale sleeping loop without leaving zero pollers", async () => {
  const { isConversationQueueActive, releaseConversationQueueOwner } = await import(
    "../src/app/image/lib/image-queue-utils.ts"
  );
  const { sleep } = await import("../src/app/image/lib/image-task-utils.ts");

  const owners = new Map();
  let mountAActive = true;
  let mountAAborted = false;
  const tokenA = Symbol("mount-a");
  const abortControllerA = new AbortController();

  owners.set("conv-race", {
    runToken: tokenA,
    isSessionActive: () => mountAActive,
    abort: () => {
      mountAAborted = true;
      abortControllerA.abort();
    },
  });

  assert.equal(isConversationQueueActive(owners, "conv-race"), true);

  // Start a 2000ms sleep in Mount A, then simulate < 2s route switch away & back
  const sleepStart = Date.now();
  const sleepingA = sleep(2000, abortControllerA.signal);
  mountAActive = false;

  // Mount B checks if queue is active -> detects stale Mount A, aborts its sleep immediately, and takes over
  assert.equal(isConversationQueueActive(owners, "conv-race"), false);
  assert.equal(mountAAborted, true);
  await sleepingA;
  assert.ok(Date.now() - sleepStart < 500, "aborted sleep should wake immediately instead of waiting 2000ms");

  const tokenB = Symbol("mount-b");
  owners.set("conv-race", {
    runToken: tokenB,
    isSessionActive: () => true,
    abort: () => undefined,
  });

  // Stale Mount A waking up in finally must NOT delete Mount B's active owner entry
  assert.equal(releaseConversationQueueOwner(owners, "conv-race", tokenA), false);
  assert.equal(isConversationQueueActive(owners, "conv-race"), true);
  assert.equal(releaseConversationQueueOwner(owners, "conv-race", tokenB), true);
  assert.equal(owners.size, 0);
});

test("[FUNC-4] getStoredImageSrc & normalizeManagedImageUrl append proxy=1 safely while preserving signed params", async () => {
  const { getStoredImageSrc, normalizeManagedImageUrl } = await import(
    "../src/app/image/components/image-results-utils.ts"
  );

  assert.equal(
    normalizeManagedImageUrl("/images/2026/11/sample.png?exp=1790000000&sig=abc123"),
    "/images/2026/11/sample.png?exp=1790000000&sig=abc123&proxy=1",
  );

  assert.equal(
    getStoredImageSrc({
      id: "img-1",
      status: "success",
      path: "2026/11/r2-card.webp",
    }),
    "/images/2026/11/r2-card.webp?proxy=1",
  );

  assert.equal(
    getStoredImageSrc({
      id: "img-2",
      status: "success",
      url: "/images/2026/11/r2-signed.webp?exp=1790000000&sig=deadbeef",
    }),
    "/images/2026/11/r2-signed.webp?exp=1790000000&sig=deadbeef&proxy=1",
  );
});
