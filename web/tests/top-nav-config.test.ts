import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    key: "sk-test",
    role: "user",
    subjectId: "u_1",
    name: "Test User",
    provider: "local",
    menuPaths,
    apiPermissions: [],
    menus: [],
  };
}

test("Classic floating-pill TopNav exposes 5 primary pills and overflow admin routes without /register", () => {
  const { primary, overflow } = partitionNavItems(navItems);
  assert.deepEqual(
    primary.map((item) => item.href),
    ["/image", "/video", "/video-library", "/image-manager", "/recharge"],
  );
  assert.deepEqual(
    primary.map((item) => item.label),
    ["图片创作", "视频创作", "视频库", "图片库", "充值中心"],
  );
  assert.equal(
    primary.find((item) => item.href === "/video-library")?.accessPath,
    "/video-library",
  );

  assert.equal(overflow[0]?.href, "/overview");
  assert.equal(overflow[0]?.label, "经营概览");
  assert.equal(overflow.at(-1)?.href, "/settings");
  assert.equal(overflow.at(-1)?.label, "设置");
  assert.equal(
    navItems.some((item) => item.href === "/register"),
    false,
  );
  assert.equal(
    new Set([...primary, ...overflow].map((item) => item.href)).size,
    navItems.length,
  );
});

test("resolveRoutePageTitle resolves all Classic routes and legacy v6 aliases", () => {
  assert.equal(resolveRoutePageTitle("/image"), "图片创作");
  assert.equal(resolveRoutePageTitle("/video"), "视频创作");
  assert.equal(resolveRoutePageTitle("/video-library"), "视频库");
  assert.equal(resolveRoutePageTitle("/image-manager"), "图片库");
  assert.equal(resolveRoutePageTitle("/recharge"), "充值中心");
  assert.equal(resolveRoutePageTitle("/profile"), "个人中心");
  assert.equal(resolveRoutePageTitle("/overview"), "经营概览");
  assert.equal(resolveRoutePageTitle("/settings"), "设置");
  assert.equal(resolveRoutePageTitle("/admin"), "经营概览");
  assert.equal(resolveRoutePageTitle("/admin/channels"), "生图渠道");
  assert.equal(resolveRoutePageTitle("/admin/settings/storage"), "媒体存储");
  assert.equal(resolveRoutePageTitle("/assets"), "图片库");
  assert.equal(resolveRoutePageTitle("/wallet"), "充值中心");
  assert.equal(resolveRoutePageTitle("/tasks"), "任务中心");
});

test("canAccessPath grants /video-library via /video and /image-manager via /image, and Classic 4.1 TopNav pills are wired cleanly", async () => {
  assert.equal(canAccessPath(buildSession(["/video"]), "/video-library"), true);
  assert.equal(
    canAccessPath(buildSession(["/video-library"]), "/video-library"),
    true,
  );
  assert.equal(canAccessPath(buildSession(["/image"]), "/video-library"), false);
  assert.equal(canAccessPath(buildSession(["/image"]), "/image-manager"), true);
  assert.equal(canAccessPath(buildSession(["/video"]), "/image-manager"), false);

  const topNavSource = await readFile(
    new URL("../src/components/top-nav.tsx", import.meta.url),
    "utf8",
  );
  assert.match(topNavSource, /collapsed=\{navCollapsed\}/);
  assert.match(topNavSource, /QUOTA_REFRESH_EVENT/);
  assert.doesNotMatch(topNavSource, /top-nav-search/);

  const topNavControlsSource = await readFile(
    new URL("../src/components/top-nav-controls.tsx", import.meta.url),
    "utf8",
  );
  assert.match(topNavControlsSource, /bg-black\/\[0\.06\]/);
  assert.match(topNavControlsSource, /bg-\[#181e25\]/);
});
