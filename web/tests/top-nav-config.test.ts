import assert from "node:assert/strict";
import test from "node:test";

import {
  navItems,
  partitionNavItems,
  resolveRoutePageTitle,
} from "../src/components/top-nav-config.ts";
import { canAccessPath } from "../src/store/auth-permissions.ts";
import type { StoredAuthSession } from "../src/store/auth-types.ts";

function buildSession(menuPaths: string[]): StoredAuthSession {
  return {
    token: "tok",
    authType: "user",
    menuPaths,
    apiPermissions: [],
    user: {
      id: "u_1",
      role: "user",
      name: "Test User",
      provider: "local",
    },
  };
}

test("top navigation keeps creative libraries visible and admin console reachable in overflow", () => {
  const { primary, overflow } = partitionNavItems(navItems);
  assert.deepEqual(
    primary.map((item) => item.href),
    ["/image", "/video", "/video-library", "/image-manager", "/recharge"],
  );
  assert.equal(
    primary.find((item) => item.href === "/video-library")?.accessPath,
    "/video-library",
  );
  assert.equal(overflow.some((item) => item.href === "/admin"), true);
  assert.equal(
    overflow.some((item) => item.href === "/admin/settings/appearance"),
    true,
  );
  assert.equal(
    new Set([...primary, ...overflow].map((item) => item.href)).size,
    navItems.length,
  );
});

test("resolveRoutePageTitle distinguishes /admin overview from nested /admin/* modules", () => {
  assert.equal(resolveRoutePageTitle("/admin"), "数据概览");
  assert.equal(resolveRoutePageTitle("/admin/channels"), "系统渠道");
  assert.equal(resolveRoutePageTitle("/admin/settings/storage"), "存储与备份");
});

test("canAccessPath allows /video-library when session grants either /video-library or legacy /video", () => {
  assert.equal(canAccessPath(buildSession(["/video"]), "/video-library"), true);
  assert.equal(
    canAccessPath(buildSession(["/video-library"]), "/video-library"),
    true,
  );
  assert.equal(canAccessPath(buildSession(["/image"]), "/video-library"), false);
});
