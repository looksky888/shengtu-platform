import assert from "node:assert/strict";
import test from "node:test";

import {
  getSettingsDomainForTab,
  getSettingsTabMeta,
  parseSettingsTab,
  searchSettingsCatalog,
  SETTINGS_TABS,
} from "../src/app/settings/settings-tab-types.ts";

test("parseSettingsTab and domain mapping cover all 10 settings tabs", () => {
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
