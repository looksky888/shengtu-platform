import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getSettingsDomainForTab,
  getSettingsTabMeta,
  parseSettingsTab,
  searchSettingsCatalog,
  SETTINGS_TAB_REFRESH_EVENT,
  SETTINGS_TABS,
} from "../src/app/settings/settings-tab-types.ts";

test("Classic /settings defines all 9 horizontal pill tabs without /register and maps legacy aliases", () => {
  assert.deepEqual(
    SETTINGS_TABS.map((tab) => tab.key),
    [
      "config",
      "channels",
      "proxy",
      "cpa",
      "email",
      "media",
      "announcements",
      "backup",
      "system",
    ],
  );
  assert.deepEqual(
    SETTINGS_TABS.map((tab) => tab.label),
    [
      "基础配置",
      "生图渠道",
      "过盾与代理",
      "CPA 号池导入",
      "邮件与风控",
      "媒体存储",
      "通知公告",
      "备份与日志",
      "系统更新",
    ],
  );

  assert.equal(parseSettingsTab(null), "config");
  assert.equal(parseSettingsTab("unknown"), "config");
  assert.equal(parseSettingsTab("channels"), "channels");
  assert.equal(parseSettingsTab("media"), "media");
  assert.equal(parseSettingsTab("system"), "system");

  // Legacy query aliases map cleanly to Classic tabs
  assert.equal(parseSettingsTab("base"), "config");
  assert.equal(parseSettingsTab("appearance"), "config");
  assert.equal(parseSettingsTab("image"), "channels");
  assert.equal(parseSettingsTab("register"), "proxy");
  assert.equal(parseSettingsTab("clearance"), "proxy");
  assert.equal(parseSettingsTab("imports"), "cpa");
  assert.equal(parseSettingsTab("access"), "email");
  assert.equal(parseSettingsTab("storage"), "media");
  assert.equal(parseSettingsTab("announcement"), "announcements");
  assert.equal(parseSettingsTab("maintenance"), "backup");
  assert.equal(parseSettingsTab("system-update"), "system");

  assert.equal(getSettingsDomainForTab("channels"), "core");
  assert.equal(getSettingsDomainForTab("proxy"), "access");
  assert.equal(getSettingsDomainForTab("media"), "content");
  assert.equal(getSettingsDomainForTab("system"), "ops");

  const configMeta = getSettingsTabMeta("config");
  assert.equal(configMeta.sections.length, 3);
  assert.equal(SETTINGS_TAB_REFRESH_EVENT, "shengtu:settings-tab-refresh");
});

test("searchSettingsCatalog finds Grok/GPT-2.6 channel pricing, R2/VIP media storage, and SMTP sections", () => {
  const grokMatches = searchSettingsCatalog("grok");
  assert.ok(grokMatches.length >= 1);
  assert.equal(grokMatches[0]?.tab, "channels");
  assert.equal(grokMatches[0]?.sectionId, "settings-section-channels-models");

  const r2Matches = searchSettingsCatalog("r2 迁移");
  assert.ok(r2Matches.length >= 1);
  assert.equal(r2Matches[0]?.tab, "media");

  const smtpMatches = searchSettingsCatalog("smtp");
  assert.ok(smtpMatches.length >= 1);
  assert.equal(smtpMatches[0]?.tab, "email");
  assert.equal(smtpMatches[0]?.sectionId, "settings-section-email-smtp");
});

test("SettingsTabContent lazy-loads all non-default tabs and embedded pages listen for SETTINGS_TAB_REFRESH_EVENT", async () => {
  const tabContentSource = await readFile(
    new URL("../src/app/settings/settings-tab-content.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tabContentSource, /@\/app\/admin\/channels\/page/);
  assert.match(tabContentSource, /@\/app\/admin\/settings\/storage\/page/);
  assert.match(tabContentSource, /@\/app\/admin\/announcements\/page/);
  assert.match(tabContentSource, /\.\/tabs\/proxy-tab/);
  assert.match(tabContentSource, /\.\/tabs\/cpa-tab/);
  assert.match(tabContentSource, /\.\/tabs\/email-risk-tab/);
  assert.match(tabContentSource, /\.\/tabs\/backup-logs-tab/);
  assert.match(tabContentSource, /\.\/tabs\/system-update-tab/);
  assert.doesNotMatch(tabContentSource, /\/api\/registration/);

  for (const relPath of [
    "../src/app/admin/channels/page.tsx",
    "../src/app/admin/settings/storage/page.tsx",
    "../src/app/admin/announcements/page.tsx",
  ]) {
    const pageSource = await readFile(
      new URL(relPath, import.meta.url),
      "utf8",
    );
    assert.match(pageSource, /SETTINGS_TAB_REFRESH_EVENT/);
    assert.match(pageSource, /embedded=\{embedded\}/);
  }
});
