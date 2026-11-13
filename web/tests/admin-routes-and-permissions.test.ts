import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  getAccessibleAdminNavGroups,
  isAdminRoutePath,
} from "../src/components/admin/admin-navigation.ts";
import {
  COLOR_THEME_STORAGE_KEY,
  getPreferredColorTheme,
} from "../src/lib/theme.ts";
import {
  canAccessPath,
  getDefaultRouteForSession,
} from "../src/store/auth-permissions.ts";
import type { StoredAuthSession } from "../src/store/auth-types.ts";

function buildSession(
  menuPaths: string[],
  role: "admin" | "user" = "user",
): StoredAuthSession {
  return {
    token: "tok",
    authType: "user",
    role,
    menuPaths,
    apiPermissions: [],
    user: {
      id: "u_test",
      role,
      name: "Operator",
      provider: "local",
    },
  };
}

test("default color theme uses v6 storage key and defaults to Yingce dark mode", () => {
  assert.equal(COLOR_THEME_STORAGE_KEY, "shengtu:v6:color-theme");
  assert.equal(getPreferredColorTheme(), "dark");
});

test("admin navigation defines 4 flat groups and strict /admin boundary detection", () => {
  assert.deepEqual(
    ADMIN_NAV_GROUPS.map((g) => g.label),
    ["概览", "算力与号池", "商业与运营", "系统配置"],
  );
  assert.equal(ADMIN_NAV_ITEMS.length, 13);
  assert.equal(isAdminRoutePath("/admin"), true);
  assert.equal(isAdminRoutePath("/admin/"), true);
  assert.equal(isAdminRoutePath("/admin/channels"), true);
  assert.equal(isAdminRoutePath("/admin/settings/storage"), true);
  assert.equal(isAdminRoutePath("/image"), false);
  assert.equal(isAdminRoutePath("/administration"), false);
});

test("canAccessPath maps Yingce /admin/* routes to legacy backend RBAC menuPaths", () => {
  const accountsOperator = buildSession(["/accounts"]);
  assert.equal(canAccessPath(accountsOperator, "/admin"), true);
  assert.equal(canAccessPath(accountsOperator, "/admin/accounts"), true);
  assert.equal(canAccessPath(accountsOperator, "/admin/payments"), false);
  assert.equal(canAccessPath(accountsOperator, "/admin/settings/storage"), false);

  const financeOperator = buildSession(["/payment-admin", "/credits-admin"]);
  assert.equal(canAccessPath(financeOperator, "/admin"), true);
  assert.equal(canAccessPath(financeOperator, "/admin/payments"), true);
  assert.equal(canAccessPath(financeOperator, "/admin/credits"), true);
  assert.equal(canAccessPath(financeOperator, "/admin/users"), false);

  const settingsOperator = buildSession(["/settings"]);
  assert.equal(canAccessPath(settingsOperator, "/admin/channels"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/clearance"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/announcements"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/settings/appearance"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/settings/access"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/settings/storage"), true);
  assert.equal(canAccessPath(settingsOperator, "/admin/settings/system"), true);

  const groups = getAccessibleAdminNavGroups(financeOperator, canAccessPath);
  assert.deepEqual(
    groups.flatMap((g) => g.items.map((i) => i.href)),
    ["/admin", "/admin/payments", "/admin/credits"],
  );
});

test("getDefaultRouteForSession sends admin to /admin and Creative users to /image", () => {
  const adminSession = buildSession(["/image", "/settings"], "admin");
  assert.equal(getDefaultRouteForSession(adminSession), "/admin");

  const creativeUser = buildSession(["/image", "/recharge"], "user");
  assert.equal(getDefaultRouteForSession(creativeUser), "/image");

  const opsOnlyUser = buildSession(["/logs"], "user");
  assert.equal(getDefaultRouteForSession(opsOnlyUser), "/admin");
});
