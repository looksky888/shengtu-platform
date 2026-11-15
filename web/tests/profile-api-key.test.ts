import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildLiveModelPricingRows,
  DEFAULT_MODEL_PRICING_ROWS,
  resolveProfileApiBaseOrigin,
} from "../src/app/profile/profile-api-pricing.ts";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function readWebSource(relativePath: string): string {
  return fs.readFileSync(path.join(testDir, "..", "src", relativePath), "utf8");
}

test("profile-user-api removes dead 404 endpoints and provides connectivity test helper", () => {
  const apiSource = readWebSource("lib/profile-user-api.ts");

  assert.doesNotMatch(apiSource, /\/api\/user-keys/);
  assert.doesNotMatch(apiSource, /\/reveal\b/);
  assert.match(apiSource, /export async function testProfileAPIKeyConnectivity\b/);
  assert.match(apiSource, /\/v1\/models/);
});

test("profile content organizes personal center with SubNav tabs and plain-Chinese API docs", () => {
  const profileContent = readWebSource("app/profile/profile-content.tsx");
  const apiKeyCard = readWebSource("app/profile/profile-api-key-card.tsx");
  const apiIntegrationPanel = readWebSource("app/profile/profile-api-integration-panel.tsx");
  const docsPanel =
    readWebSource("app/profile/profile-api-docs-panel.tsx") +
    "\n" +
    readWebSource("app/profile/profile-api-docs-catalog.ts");

  assert.match(profileContent, /SubNav/);
  assert.match(profileContent, /概览与账号安全/);
  assert.match(profileContent, /接口密钥与 API 文档/);
  assert.match(profileContent, /积分中心与流水/);
  assert.match(profileContent, /ProfileApiDocsPanel/);

  for (const endpointPath of [
    "/v1/models",
    "/v1/images/generations",
    "/v1/images/edits",
    "/v1/videos",
    "/v1/videos/{id}",
    "/v1/chat/completions",
    "/v1/responses",
    "/api/profile/credits",
  ]) {
    assert.ok(
      docsPanel.includes(endpointPath),
      `expected ProfileApiDocsPanel to document ${endpointPath}`,
    );
  }

  // Real 2.6 models & GIF options are documented clearly
  assert.match(docsPanel, /gpt-image-2\.6-flare/);
  assert.match(docsPanel, /gpt-image-2\.6-sunburst/);
  assert.match(docsPanel, /grok-imagine-image/);
  assert.match(docsPanel, /grok-imagine-video/);
  assert.match(docsPanel, /"output_format":\s*"gif"/);
  assert.match(docsPanel, /frame_count/);
  assert.match(docsPanel, /frame_duration_ms/);
  assert.match(docsPanel, /5 积分\/张/);

  // Fake models, fake mask field, and robotic AI-speak are removed
  assert.doesNotMatch(docsPanel, /gpt-image-1/);
  assert.doesNotMatch(docsPanel, /grok-3/);
  assert.doesNotMatch(docsPanel, /"mask"/);
  assert.doesNotMatch(docsPanel, /name:\s*"mask"/);

  const allProfileUi = [profileContent, apiKeyCard, apiIntegrationPanel, docsPanel].join("\n");
  for (const bannedPhrase of [
    "一站式办理算力补充、卡密核销与账户权益查询",
    "专属 API 凭证初始化",
    "SHA-256 哈希托管",
    "已授权协议能力",
    "全链路原生兼容",
    "算力账本",
  ]) {
    assert.ok(
      !allProfileUi.includes(bannedPhrase),
      `expected /profile UI to eliminate robotic phrase: ${bannedPhrase}`,
    );
  }
});

test("[FUNC-2 & FUNC-3] dynamic model pricing matches backend defaults, applies live admin pricing, and resolves apiUrl", () => {
  const defaultByModel = new Map(DEFAULT_MODEL_PRICING_ROWS.map((row) => [row.model, row.price]));
  assert.equal(defaultByModel.get("gpt-image-2.6-flare"), "5 积分/张");
  assert.equal(defaultByModel.get("gpt-image-2.6"), "5 积分/张");
  assert.equal(defaultByModel.get("gpt-image-2.6-sunburst"), "5 积分/张");
  assert.equal(defaultByModel.get("gpt-image-2.5-flare / gpt-image-2.5-sunburst"), "3 积分/张");
  assert.equal(defaultByModel.get("gpt-image-2.5"), "2 积分/张");
  assert.equal(defaultByModel.get("gpt-image-2"), "1 积分/张");
  assert.equal(defaultByModel.get("grok-imagine-image"), "1K 1 积分 / 2K 2 积分");
  assert.equal(defaultByModel.get("grok-imagine-video"), "1 积分/秒");

  const liveRows = buildLiveModelPricingRows(
    {
      image_default_model: "gpt-image-2.6-sunburst",
      gpt_image_2_6_flare_credit_cost: 8,
      gpt_image_2_6_credit_cost: 6,
      gpt_image_2_6_sunburst_credit_cost: 7,
      gpt_image_2_5_flare_credit_cost: 4,
      gpt_image_2_5_sunburst_credit_cost: 5,
      gpt_image_2_5_credit_cost: 3,
      gpt_image_2_credit_cost: 2,
      grok_image_credit_cost_1k: 2,
      grok_image_credit_cost_2k: 4,
      video_credit_cost_per_second: 3,
    },
    [
      {
        id: "chan-flux-pro",
        display_name: "Flux Pro Studio",
        upstream_model: "flux-pro-1.1",
        channel_type: "openai_compatible",
        channel_name: "Custom Flux",
        capabilities: ["generate", "edit"],
        formats: ["png", "webp"],
        credit_cost: 9,
      },
    ],
  );

  const liveMap = new Map(liveRows.map((row) => [row.model, row]));
  assert.equal(liveMap.get("gpt-image-2.6-flare")?.price, "8 积分/张");
  assert.equal(liveMap.get("gpt-image-2.6-sunburst")?.recommended, true);
  assert.equal(liveMap.get("gpt-image-2.5-flare")?.price, "4 积分/张");
  assert.equal(liveMap.get("gpt-image-2.5-sunburst")?.price, "5 积分/张");
  assert.equal(liveMap.get("gpt-image-2.5")?.price, "3 积分/张");
  assert.equal(liveMap.get("gpt-image-2")?.price, "2 积分/张");
  assert.equal(liveMap.get("grok-imagine-image")?.price, "1K 2 积分 / 2K 4 积分");
  assert.equal(liveMap.get("grok-imagine-video")?.price, "3 积分/秒");
  assert.equal(liveMap.get("flux-pro-1.1")?.price, "9 积分/张");

  assert.equal(
    resolveProfileApiBaseOrigin("", "https://www.shengtu.xyz/"),
    "https://www.shengtu.xyz",
  );
  assert.equal(
    resolveProfileApiBaseOrigin("/api", "https://www.shengtu.xyz"),
    "https://www.shengtu.xyz",
  );
  assert.equal(
    resolveProfileApiBaseOrigin("https://api.shengtu.xyz/v1/", "https://www.shengtu.xyz"),
    "https://api.shengtu.xyz",
  );
  assert.equal(
    resolveProfileApiBaseOrigin("http://127.0.0.1:8000/", "http://localhost:5173"),
    "http://127.0.0.1:8000",
  );
});

test("[FUNC-2, FUNC-6 & NAV-1] profile docs lazy chunk, mobile min-w-0 layout, and recharge/redeem navigation", () => {
  const docsPanelOnly = readWebSource("app/profile/profile-api-docs-panel.tsx");
  const apiKeyCard = readWebSource("app/profile/profile-api-key-card.tsx");
  const profileContent = readWebSource("app/profile/profile-content.tsx");

  // True lazy-loading of profile-api-docs-catalog.ts: only `import type` + dynamic `import()`
  assert.doesNotMatch(
    docsPanelOnly,
    /import\s*\{(?!\s*type\b)[^}]*\}\s*from\s*["'](?:\.\/|@\/app\/profile\/)profile-api-docs-catalog["']/,
  );
  assert.match(docsPanelOnly, /import\(["'](?:\.\/|@\/app\/profile\/)profile-api-docs-catalog["']\)/);
  assert.match(docsPanelOnly, /fetchCreationPricing/);
  assert.match(docsPanelOnly, /fetchModelCatalog/);
  assert.match(docsPanelOnly, /min-w-0/);

  // No single-line truncate on CardDescription & respects webConfig.apiUrl
  assert.doesNotMatch(apiKeyCard, /CardDescription[^>]*truncate/);
  assert.match(apiKeyCard, /resolveProfileApiBaseOrigin/);
  assert.match(apiKeyCard, /min-w-0/);

  // Direct /recharge permission & links + account tab smooth scroll to #profile-invite-redeem
  assert.doesNotMatch(profileContent, /\/wallet/);
  assert.match(profileContent, /canAccessPath\([^,]+,\s*"\/recharge"\)/);
  assert.match(profileContent, /to="\/recharge"/);
  assert.match(profileContent, /profile-invite-redeem/);
});
