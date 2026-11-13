import assert from "node:assert/strict";
import test from "node:test";

import {
  getSettingsDomainForTab,
  getSettingsTabMeta,
  parseSettingsTab,
  searchSettingsCatalog,
  SETTINGS_TABS,
} from "../src/app/settings/settings-tab-types.ts";
import { resolveLegacySettingsRedirect } from "../src/components/admin/admin-navigation.ts";

test("parseSettingsTab and domain mapping cover all 10 legacy settings tabs", () => {
  assert.equal(SETTINGS_TABS.length, 10);
  assert.equal(parseSettingsTab(null), "base");
  assert.equal(parseSettingsTab("unknown"), "base");
  assert.equal(parseSettingsTab("image"), "image");
  assert.equal(parseSettingsTab("system-update"), "system-update");

  assert.equal(getSettingsDomainForTab("image"), "core");
  assert.equal(getSettingsDomainForTab("register"), "access");
  assert.equal(getSettingsDomainForTab("storage"), "content");
  assert.equal(getSettingsDomainForTab("system-update"), "ops");

  const imageMeta = getSettingsTabMeta("image");
  assert.equal(imageMeta.sections.length, 3);
});

test("resolveLegacySettingsRedirect maps all 10 legacy /settings?tab=... queries to Yingce /admin/* routes", () => {
  assert.equal(resolveLegacySettingsRedirect(""), "/admin/settings/appearance");
  assert.equal(resolveLegacySettingsRedirect("?tab=base"), "/admin/settings/appearance");
  assert.equal(resolveLegacySettingsRedirect("?tab=image"), "/admin/channels");
  assert.equal(resolveLegacySettingsRedirect("?tab=email"), "/admin/settings/access?tab=email");
  assert.equal(resolveLegacySettingsRedirect("?tab=register"), "/admin/clearance");
  assert.equal(resolveLegacySettingsRedirect("?tab=imports"), "/admin/accounts?tab=cpa");
  assert.equal(resolveLegacySettingsRedirect("?tab=storage"), "/admin/settings/storage?tab=media");
  assert.equal(resolveLegacySettingsRedirect("?tab=announcement"), "/admin/announcements");
  assert.equal(resolveLegacySettingsRedirect("?tab=backup"), "/admin/settings/storage?tab=backup");
  assert.equal(resolveLegacySettingsRedirect("?tab=maintenance"), "/admin/settings/system?tab=governance");
  assert.equal(resolveLegacySettingsRedirect("?tab=system-update"), "/admin/settings/system?tab=update");
});

test("searchSettingsCatalog finds Grok channel pricing, R2 storage, and SMTP sections", () => {
  const grokMatches = searchSettingsCatalog("grok");
  assert.ok(grokMatches.length >= 1);
  assert.equal(grokMatches[0]?.tab, "image");
  assert.equal(grokMatches[0]?.sectionId, "settings-section-image-channels");

  const r2Matches = searchSettingsCatalog("r2 迁移");
  assert.ok(r2Matches.length >= 1);
  assert.equal(r2Matches[0]?.tab, "storage");

  const smtpMatches = searchSettingsCatalog("smtp");
  assert.ok(smtpMatches.length >= 1);
  assert.equal(smtpMatches[0]?.tab, "email");
  assert.equal(smtpMatches[0]?.sectionId, "settings-section-email-smtp");
});
