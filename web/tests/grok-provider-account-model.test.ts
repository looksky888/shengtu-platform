import assert from "node:assert/strict";
import test from "node:test";

import {
  accountDetection,
  accountDisplayTime,
  accountTypeLabel,
  credentialLabel,
  orderedConnections,
  sourceLabel,
} from "../src/app/accounts/grok-provider-account-model.ts";
import type { GrokProviderAccount } from "../src/lib/grok-provider-accounts-api.ts";

function account(overrides: Partial<GrokProviderAccount> = {}): GrokProviderAccount {
  return {
    id: "web-1", provider: "web", status: "active", source_type: "managed_import",
    display_name: "user@example.com", email_masked: "u***@example.com", credential_kind: "sso",
    has_credential: true, max_concurrent: 1,
    egress: { mode: "inherit", identity: "inherit", configured: false },
    capabilities: ["text", "image"], metadata: {}, source_created_at: "",
    source_updated_at: "", projected_at: "2026-08-12T00:00:00Z", links: [], quotas: [],
    ...overrides,
  };
}

test("account type uses only documented provider metadata", () => {
  assert.equal(accountTypeLabel(account({ metadata: { tier: "super" } })), "Super");
  assert.equal(accountTypeLabel(account({ metadata: { tier: "unexpected" } })), "Web");
  assert.equal(accountTypeLabel(account({ provider: "console" })), "Console");
  assert.equal(accountTypeLabel(account({
    provider: "build",
    quotas: [{ capability: "billing", remaining: 1, limit_value: 2, reset_at: "", checked_at: "", status: "available", metadata: { plan_name: "SuperGrok Pro" } }],
  })), "SuperGrok Pro");
});

test("credential label distinguishes missing, oauth and sso", () => {
  assert.equal(credentialLabel(account({ has_credential: false })), "凭据缺失");
  assert.equal(credentialLabel(account({ credential_kind: "oauth" })), "OAuth 有效");
  assert.equal(credentialLabel(account()), "SSO 已保存");
});

test("provider import source uses a user-facing label", () => {
  assert.equal(sourceLabel("provider_import"), "账号导入");
  assert.equal(sourceLabel("custom_source"), "custom_source");
});

test("detection rejects malformed metadata and preserves real outcome", () => {
  assert.equal(accountDetection(account({ metadata: { detection: { outcome: "maybe" } } })), null);
  assert.deepEqual(accountDetection(account({ metadata: { detection: {
    outcome: "failed", code: "web_detection_rate_limited", status_code: 429,
    checked_at: "2026-08-12T01:02:03Z",
  } } })), {
    outcome: "failed", code: "web_detection_rate_limited", statusCode: 429,
    checkedAt: "2026-08-12T01:02:03Z",
  });
});

test("connections include current account and sort by provider", () => {
  const values = orderedConnections(account({
    provider: "console",
    links: [
      { id: "l2", kind: "web_console", account_id: "web-2", provider: "web", status: "active" },
      { id: "l1", kind: "web_build", account_id: "build-1", provider: "build", status: "disabled" },
    ],
  }));
  assert.deepEqual(values.map((item) => item.provider), ["build", "web", "console"]);
  assert.equal(values.at(-1)?.current, true);
});

test("display time follows source update, create, then projection", () => {
  assert.deepEqual(accountDisplayTime(account({ source_updated_at: "u", source_created_at: "c" })), { label: "更新时间", value: "u" });
  assert.deepEqual(accountDisplayTime(account({ source_created_at: "c" })), { label: "创建时间", value: "c" });
  assert.deepEqual(accountDisplayTime(account()), { label: "投影时间", value: "2026-08-12T00:00:00Z" });
});
