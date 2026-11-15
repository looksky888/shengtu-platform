import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COLOR_THEME_STORAGE_KEY,
  getPreferredColorTheme,
} from "../src/lib/theme.ts";
import {
  canAccessPath,
  getDefaultRouteForSession,
} from "../src/store/auth-permissions.ts";
import type { AuthRole, StoredAuthSession } from "../src/store/auth-types.ts";

function buildSession(
  menuPaths: string[],
  role: AuthRole = "user",
): StoredAuthSession {
  return {
    key: "sk-test",
    role,
    subjectId: "u_test",
    name: "Operator",
    provider: "local",
    menuPaths,
    apiPermissions: [],
    menus: [],
  };
}

test("default color theme uses Classic storage key and defaults to light mode", () => {
  assert.equal(COLOR_THEME_STORAGE_KEY, "shengtu:classic:color-theme");
  assert.equal(getPreferredColorTheme(), "light");
});

test("canAccessPath scopes /overview to full or broad admins while supporting Classic routes and legacy /admin/* aliases", () => {
  const accountsOperator = buildSession(["/accounts"]);
  assert.equal(canAccessPath(accountsOperator, "/overview"), false);
  assert.equal(canAccessPath(accountsOperator, "/admin"), false);
  assert.equal(canAccessPath(accountsOperator, "/accounts"), true);
  assert.equal(canAccessPath(accountsOperator, "/admin/accounts"), true);
  assert.equal(canAccessPath(accountsOperator, "/payment-admin"), false);
  assert.equal(canAccessPath(accountsOperator, "/settings"), false);

  const financeOperator = buildSession(["/payment-admin", "/credits-admin"]);
  assert.equal(canAccessPath(financeOperator, "/overview"), false);
  assert.equal(canAccessPath(financeOperator, "/payment-admin"), true);
  assert.equal(canAccessPath(financeOperator, "/credits-admin"), true);
  assert.equal(canAccessPath(financeOperator, "/admin/payments"), true);
  assert.equal(canAccessPath(financeOperator, "/admin/credits"), true);
  assert.equal(canAccessPath(financeOperator, "/users"), false);

  const broadOpsOperator = buildSession(["/users", "/accounts"]);
  assert.equal(canAccessPath(broadOpsOperator, "/overview"), true);
  assert.equal(canAccessPath(broadOpsOperator, "/admin"), true);

  const settingsOperator = buildSession(["/settings"]);
  assert.equal(canAccessPath(settingsOperator, "/overview"), true);
  assert.equal(canAccessPath(settingsOperator, "/settings"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/channels"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/clearance"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/announcements"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/settings/storage"), true);
});

test("getDefaultRouteForSession lands creative users on /image, broad admins on /overview, and scoped operators on their tool route", () => {
  const adminSession = buildSession(["/image", "/settings"], "admin");
  assert.equal(getDefaultRouteForSession(adminSession), "/image");

  const creativeUser = buildSession(["/image", "/recharge"], "user");
  assert.equal(getDefaultRouteForSession(creativeUser), "/image");

  const broadSettingsOperator = buildSession(["/settings"], "user");
  assert.equal(getDefaultRouteForSession(broadSettingsOperator), "/overview");

  const icloudOnlyOperator = buildSession(["/icloud"], "user");
  assert.equal(getDefaultRouteForSession(icloudOnlyOperator), "/icloud");

  const logsOnlyOperator = buildSession(["/logs"], "user");
  assert.equal(getDefaultRouteForSession(logsOnlyOperator), "/logs");

  const accountsOnlyOperator = buildSession(["/accounts"], "user");
  assert.equal(getDefaultRouteForSession(accountsOnlyOperator), "/accounts");
});

test("bookmark redirects, Classic admin links, AnnouncementBanner, and creation error actions enforce RBAC", async () => {
  const redirectsSource = await readFile(
    new URL("../src/app/route-redirects.tsx", import.meta.url),
    "utf8",
  );
  assert.match(redirectsSource, /!canAccessPath\(session,\s*"\/image-manager"\)/);
  assert.match(redirectsSource, /canAccessPath\(session,\s*"\/video-library"\)/);
  assert.match(redirectsSource, /export function AdminTabBookmarkRedirect/);

  const routeConfigSource = await readFile(
    new URL("../src/app/route-config.tsx", import.meta.url),
    "utf8",
  );
  assert.match(routeConfigSource, /AdminTabBookmarkRedirect to="\/credits-admin"/);
  assert.match(routeConfigSource, /AdminTabBookmarkRedirect to="\/payment-admin"/);

  const announcementBannerSource = await readFile(
    new URL("../src/components/announcement-banner.tsx", import.meta.url),
    "utf8",
  );
  for (const route of [
    "/overview",
    "/task-queue",
    "/accounts",
    "/icloud",
    "/users",
    "/credits-admin",
    "/payment-admin",
    "/rbac",
    "/logs",
  ]) {
    assert.ok(
      announcementBannerSource.includes(`"${route}"`),
      `expected AnnouncementBanner admin mute list to include ${route}`,
    );
  }

  const creationTaskErrorsSource = await readFile(
    new URL("../src/lib/creation-task-errors.ts", import.meta.url),
    "utf8",
  );
  assert.match(creationTaskErrorsSource, /canAccessPath\(resolvedSession,\s*"\/accounts"\)/);
  assert.match(creationTaskErrorsSource, /canAccessPath\(resolvedSession,\s*"\/recharge"\)/);

  const icloudSource = await readFile(
    new URL("../src/app/icloud/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(icloudSource, /\/settings\?tab=email/);
  assert.doesNotMatch(icloudSource, /\/admin\/settings\/access/);

  const poolHealthSource = await readFile(
    new URL("../src/app/task-queue/task-queue-pool-health-card.tsx", import.meta.url),
    "utf8",
  );
  assert.match(poolHealthSource, /to="\/accounts"/);
  assert.doesNotMatch(poolHealthSource, /\/admin\/accounts/);

  const importDialogSource = await readFile(
    new URL("../src/app/accounts/components/account-import-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(importDialogSource, /\/settings\?tab=cpa/);
  assert.doesNotMatch(importDialogSource, /\/admin\/accounts\?tab=cpa/);
});
