import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("profile content organizes personal center with SubNav tabs and interactive API docs", () => {
  const profileContent = readWebSource("app/profile/profile-content.tsx");
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
  ]) {
    assert.ok(
      docsPanel.includes(endpointPath),
      `expected ProfileAPIDocsPanel to document ${endpointPath}`,
    );
  }
});
