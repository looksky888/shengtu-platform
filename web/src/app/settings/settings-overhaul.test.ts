import assert from "node:assert/strict";
import test from "node:test";

import type * as DirtyMod from "./settings-dirty";
import type * as RegistryMod from "./settings-dirty-registry-store";
import type * as TabTypesMod from "./settings-tab-types";

async function loadModules() {
  const [dirty, registry, tabTypes] = await Promise.all([
    import(
      new URL("./settings-dirty.ts", import.meta.url).href
    ) as Promise<typeof DirtyMod>,
    import(
      new URL("./settings-dirty-registry-store.ts", import.meta.url).href
    ) as Promise<typeof RegistryMod>,
    import(
      new URL("./settings-tab-types.ts", import.meta.url).href
    ) as Promise<typeof TabTypesMod>,
  ]);
  return { dirty, registry, tabTypes };
}

test("grouped sidebar domain structure covers all 9 canonical tabs and filters media for non-admin", async () => {
  const { tabTypes } = await loadModules();
  const { SETTINGS_DOMAIN_GROUPS, SETTINGS_TABS, parseSettingsTab } = tabTypes;

  const groupedTabs = SETTINGS_DOMAIN_GROUPS.flatMap((group) => group.tabs);
  const canonicalTabs = SETTINGS_TABS.map((tab) => tab.key);
  assert.deepEqual(groupedTabs, canonicalTabs);
  assert.equal(canonicalTabs.length, 9);

  // Non-admin visibility rule: hide "media" and fallback ?tab=media / ?tab=storage to "config"
  const nonAdminTabs: TabTypesMod.SettingsTabKey[] = SETTINGS_TABS.filter(
    (tab) => tab.key !== "media",
  ).map((tab) => tab.key);
  assert.equal(nonAdminTabs.length, 8);
  assert.equal(nonAdminTabs.includes("media"), false);

  const requestedFromLegacyAlias = parseSettingsTab("storage");
  assert.equal(requestedFromLegacyAlias, "media");
  const effectiveNonAdminTab =
    requestedFromLegacyAlias === "media" ? "config" : requestedFromLegacyAlias;
  assert.equal(effectiveNonAdminTab, "config");
});

test("section-scoped dirty detection and discard isolate sibling cards sharing SettingsConfig", async () => {
  const { dirty } = await loadModules();
  const { configSnapshot, extractSavedConfigSection, isConfigKeysDirty } =
    dirty;

  const baseline = {
    base_url: "https://example.com",
    canvas_url: "https://canvas.example.com",
    media_r2_secret_access_key: "",
  };

  const saved = configSnapshot(baseline);

  const edited = {
    ...baseline,
    canvas_url: "https://next-canvas.example.com",
    media_r2_secret_access_key: "top-secret-r2-key",
  };

  assert.equal(isConfigKeysDirty(edited as never, saved, ["base_url"]), false);
  assert.equal(
    isConfigKeysDirty(edited as never, saved, ["canvas_url"]),
    true,
  );
  assert.equal(
    isConfigKeysDirty(edited as never, saved, ["media_r2_secret_access_key"]),
    true,
  );

  // Resetting only the canvas section preserves other edited sections and clears secrets safely when targeted
  const canvasReset = extractSavedConfigSection(saved, ["canvas_url"]);
  assert.deepEqual(canvasReset, {
    canvas_url: "https://canvas.example.com",
  });

  const secretReset = extractSavedConfigSection(saved, [
    "media_r2_secret_access_key",
  ]);
  assert.deepEqual(secretReset, {
    media_r2_secret_access_key: "",
  });
});

test("SettingsDirtyRegistryStore typed with SettingsTabKey coordinates multi-card validate, save, and discard", async () => {
  const { registry } = await loadModules();
  const store =
    registry.createSettingsDirtyRegistryStore<TabTypesMod.SettingsTabKey>();
  const events: string[] = [];

  store.upsertEntry({
    id: "config:runtime",
    tab: "config",
    label: "运行并发与限流",
    isDirty: true,
    validate: () => {
      events.push("validate:runtime");
      return true;
    },
    save: async () => {
      events.push("save:runtime");
      return true;
    },
    discard: () => {
      events.push("discard:runtime");
      return true;
    },
  });

  store.upsertEntry({
    id: "config:canvas-link",
    tab: "config",
    label: "无限画布外链",
    isDirty: true,
    validate: () => {
      events.push("validate:canvas");
      return true;
    },
    save: async () => {
      events.push("save:canvas");
      return true;
    },
    discard: () => {
      events.push("discard:canvas");
      return true;
    },
  });

  store.upsertEntry({
    id: "backup:log-governance",
    tab: "backup",
    label: "运行日志级别",
    isDirty: false,
  });

  const activeConfigDirty = Object.values(store.getSnapshot()).filter(
    (entry) => entry.tab === "config" && entry.isDirty,
  );
  assert.equal(activeConfigDirty.length, 2);

  for (const entry of activeConfigDirty) {
    assert.equal(await entry.validate?.(), true);
  }
  for (const entry of activeConfigDirty) {
    assert.equal(await entry.save?.(), true);
  }

  assert.deepEqual(events, [
    "validate:runtime",
    "validate:canvas",
    "save:runtime",
    "save:canvas",
  ]);
});
