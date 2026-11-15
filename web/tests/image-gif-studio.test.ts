import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildComposerRecallState } from "../src/app/image/lib/image-turn-recall.ts";
import type { ImageTurn } from "../src/store/image-conversation-types.ts";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function readWebSource(relativePath: string): string {
  return fs.readFileSync(path.join(testDir, "..", "src", relativePath), "utf8");
}

test("GIF turn recall preserves frameCount & frameDurationMs and strips compression", () => {
  const gifTurn: ImageTurn = {
    id: "turn-gif-1",
    prompt: "像素风小猫摇尾巴循环动画",
    model: "gpt-image-2.6-flare",
    mode: "generate",
    referenceImages: [
      {
        name: "cat.gif",
        type: "image/gif",
        dataUrl: "data:image/gif;base64,R0lGODlh",
      },
    ],
    count: 1,
    size: "1024x1024",
    quality: "high",
    outputFormat: "gif",
    outputCompression: 85,
    frameCount: 16,
    frameDurationMs: 90,
    visibility: "private",
    images: [{ id: "img-gif-1", status: "success", url: "/images/2026/11/cat.gif", outputFormat: "gif" }],
    createdAt: "2026-11-14T12:00:00+08:00",
    status: "success",
  };

  const recalled = buildComposerRecallState(gifTurn, "gpt-image-2.6-flare", "gpt-5.4");
  assert.equal(recalled.outputFormat, "gif");
  assert.equal(recalled.outputCompression, "");
  assert.equal(recalled.frameCount, "16");
  assert.equal(recalled.frameDurationMs, "90");
  assert.equal(recalled.referenceImages[0]?.type, "image/gif");
});

test("Classic 4.3 /image studio layout & GIF QA fixes remain wired", () => {
  const layoutHook = readWebSource("app/image/hooks/use-image-page-layout.ts");
  const workflowHook = readWebSource("app/image/hooks/use-image-composer-workflow.ts");
  const workspace = readWebSource("app/image/components/image-page-workspace.tsx");
  const sidebar = readWebSource("app/image/components/image-sidebar.tsx");
  const emptyState = readWebSource("app/image/components/image-results-empty-state.tsx");
  const settingsPopover = readWebSource("app/image/components/composer-settings-popover.tsx");
  const resultSummary = readWebSource("app/image/components/image-turn-result-summary.tsx");
  const imageApi = readWebSource("lib/image-api.ts");

  assert.match(layoutHook, /useState\(true\)/);
  assert.doesNotMatch(workflowHook, /setImageOutputFormat\(DEFAULT_IMAGE_OUTPUT_FORMAT\)/);
  assert.match(workspace, /lg:grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.match(sidebar, /#1456f0/);
  assert.match(sidebar, /新建对话/);
  assert.match(emptyState, /Turn ideas into images/);
  assert.match(settingsPopover, /帧数 \(可选\)/);
  assert.match(settingsPopover, /帧间隔 ms \(可选\)/);
  assert.match(resultSummary, /turn\.outputFormat !== "gif"/);
  assert.match(imageApi, /frame_count/);
  assert.match(imageApi, /frame_duration_ms/);
});

test("[FUNC-5 & NAV-2] GIF frame state hygiene, /image-manager links, and dead ImageEditDialog cleanup", () => {
  const settingsPopover = readWebSource("app/image/components/composer-settings-popover.tsx");
  const composerSettings = readWebSource("app/image/hooks/use-image-composer-settings.tsx");
  const presetAction = readWebSource("app/image/hooks/use-image-prompt-preset-action.ts");
  const sidebar = readWebSource("app/image/components/image-sidebar.tsx");
  const successCard = readWebSource("app/image/components/image-success-result-card.tsx");
  const resultsUtils = readWebSource("app/image/components/image-results-utils.ts");
  const pageContentView = readWebSource("app/image/components/image-page-content-view.tsx");

  // Leaving GIF format or switching to a non-GIF model or applying a static preset clears GIF frame state
  assert.match(settingsPopover, /if \(nextFormat !== "gif"\)[\s\S]*?onImageFrameCountChange\(""\)/);
  assert.match(settingsPopover, /if \(nextFormat !== "gif"\)[\s\S]*?onImageFrameDurationMsChange\(""\)/);
  assert.match(composerSettings, /setImageFrameCount\(""\)/);
  assert.match(composerSettings, /setImageFrameDurationMs\(""\)/);
  assert.match(presetAction, /setImageOutputFormat\?\.\("png"\)/);
  assert.match(presetAction, /setImageOutputCompression\?\.\(""\)/);
  assert.match(presetAction, /setImageFrameCount\?\.\(""\)/);
  assert.match(presetAction, /setImageFrameDurationMs\?\.\(""\)/);

  // Direct /image-manager links instead of legacy /assets redirects
  assert.doesNotMatch(sidebar, /to="\/assets"/);
  assert.match(sidebar, /to="\/image-manager"/);
  assert.doesNotMatch(successCard, /to="\/assets"/);
  assert.match(successCard, /to="\/image-manager"/);

  // R2 proxy=1 helper wired in image-results-utils
  assert.match(resultsUtils, /buildSameOriginImageProxySrc/);

  // Unreachable ImageEditDialog dead code removed cleanly
  assert.doesNotMatch(pageContentView, /ImageEditDialog/);
  assert.equal(
    fs.existsSync(path.join(testDir, "..", "src", "app", "image", "components", "edit-dialog")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(testDir, "..", "src", "app", "image", "hooks", "use-image-edit-dialog-state.ts")),
    false,
  );
});
