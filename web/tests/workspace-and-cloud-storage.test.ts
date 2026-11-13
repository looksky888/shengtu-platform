import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getAssetsTypeTabOptions,
  parseAssetsScope,
  parseAssetsTypeTab,
  resolveAssetOrientation,
  resolveImageExpiryBadge,
} from "../src/app/assets/assets-cloud-policy.ts";
import { resolveRoutePageTitle } from "../src/components/top-nav-config.ts";
import {
  buildWorkspaceNavItems,
  getMobileWorkspaceNavItems,
  isStudioWorkspaceRoute,
  isWorkspaceNavItemActive,
  resolveLegacyImageManagerRedirect,
  resolveLegacyVideoLibraryRedirect,
  resolveWorkspaceCanvasUrl,
} from "../src/components/workspace/workspace-navigation.ts";
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
    subjectId: "user_1",
    name: "Studio Tester",
    provider: "local",
    menuPaths,
    apiPermissions: [],
    menus: [],
  };
}

test("workspace navigation builds rail items, dynamic canvas link, and mobile bar", () => {
  const session = buildSession(["/image", "/video"]);
  const items = buildWorkspaceNavItems({
    session,
    checkAccess: canAccessPath,
    canvasUrl: "https://canvas.example.com/studio",
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["create", "canvas", "tasks", "assets", "wallet", "settings"],
  );
  assert.equal(items.find((item) => item.id === "create")?.href, "/image");
  assert.equal(
    items.find((item) => item.id === "canvas")?.href,
    "https://canvas.example.com/studio",
  );
  assert.equal(items.find((item) => item.id === "canvas")?.external, true);

  const mobile = getMobileWorkspaceNavItems(items);
  assert.deepEqual(
    mobile.map((item) => item.id),
    ["create", "tasks", "assets", "wallet", "settings"],
  );

  const createItem = items.find((item) => item.id === "create")!;
  assert.equal(isWorkspaceNavItemActive("/image", createItem), true);
  assert.equal(isWorkspaceNavItemActive("/video", createItem), true);
  assert.equal(isWorkspaceNavItemActive("/assets", createItem), false);

  assert.equal(isStudioWorkspaceRoute("/image"), true);
  assert.equal(isStudioWorkspaceRoute("/video"), true);
  assert.equal(isStudioWorkspaceRoute("/assets"), false);
  assert.equal(isStudioWorkspaceRoute("/tasks"), false);
  assert.equal(isStudioWorkspaceRoute("/wallet"), false);
});

test("resolveWorkspaceCanvasUrl rejects malformed or credentialed URLs", () => {
  assert.equal(
    resolveWorkspaceCanvasUrl("https://canvas.yingce.ai/app"),
    "https://canvas.yingce.ai/app",
  );
  assert.equal(resolveWorkspaceCanvasUrl("javascript:alert(1)"), "");
  assert.equal(resolveWorkspaceCanvasUrl("https://user:pass@example.com"), "");
  assert.equal(resolveWorkspaceCanvasUrl("   "), "");
});

test("legacy user library routes redirect cleanly to unified /assets tabs", () => {
  assert.equal(resolveLegacyImageManagerRedirect(""), "/assets?type=image");
  assert.equal(
    resolveLegacyImageManagerRedirect("?view=public"),
    "/assets?type=image&view=public",
  );
  assert.equal(
    resolveLegacyImageManagerRedirect("?scope=all"),
    "/assets?type=image&view=all",
  );
  assert.equal(resolveLegacyVideoLibraryRedirect(""), "/assets?type=video");
  assert.equal(
    resolveLegacyVideoLibraryRedirect("?view=public"),
    "/assets?type=video&view=public",
  );
});

test("RBAC permissions and default route support /tasks, /assets, /wallet with legacy menuPaths", () => {
  const videoOnlySession = buildSession(["/video"]);
  assert.equal(canAccessPath(videoOnlySession, "/tasks"), true);
  assert.equal(canAccessPath(videoOnlySession, "/assets"), true);
  assert.equal(canAccessPath(videoOnlySession, "/wallet"), true);
  assert.equal(canAccessPath(videoOnlySession, "/profile"), true);
  assert.equal(getDefaultRouteForSession(videoOnlySession), "/video");

  const legacyGallerySession = buildSession(["/image-manager", "/recharge"]);
  assert.equal(canAccessPath(legacyGallerySession, "/assets"), true);
  assert.equal(canAccessPath(legacyGallerySession, "/tasks"), false);
  assert.equal(canAccessPath(legacyGallerySession, "/wallet"), true);
  assert.equal(
    getDefaultRouteForSession(legacyGallerySession),
    "/assets",
  );

  const rechargeOnlySession = buildSession(["/recharge"]);
  assert.equal(getDefaultRouteForSession(rechargeOnlySession), "/wallet");

  assert.equal(resolveRoutePageTitle("/tasks"), "任务中心");
  assert.equal(resolveRoutePageTitle("/assets"), "素材云库");
  assert.equal(resolveRoutePageTitle("/wallet"), "积分与权益中心");
});

test("assets cloud policy strictly hides expiring tabs and countdown badges when cloudStorageEnabled is false", () => {
  const nowMs = Date.parse("2026-05-01T00:00:00Z");
  const inTwoDays = "2026-05-03T00:00:00Z";
  const inSixHours = "2026-05-01T06:00:00Z";

  assert.deepEqual(
    getAssetsTypeTabOptions(false).map((item) => item.value),
    ["all", "image", "video"],
  );
  assert.equal(parseAssetsTypeTab("expiring", false), "all");
  assert.equal(
    resolveImageExpiryBadge({
      cloudStorageEnabled: false,
      scope: "mine",
      expiresAt: inTwoDays,
      nowMs,
    }),
    null,
  );

  assert.deepEqual(
    getAssetsTypeTabOptions(true).map((item) => item.value),
    ["all", "image", "video", "expiring"],
  );
  assert.equal(parseAssetsTypeTab("expiring", true), "expiring");
  assert.deepEqual(
    resolveImageExpiryBadge({
      cloudStorageEnabled: true,
      scope: "mine",
      expiresAt: inTwoDays,
      nowMs,
    }),
    { label: "剩余 2 天", urgent: true },
  );
  assert.deepEqual(
    resolveImageExpiryBadge({
      cloudStorageEnabled: true,
      scope: "mine",
      expiresAt: inSixHours,
      nowMs,
    }),
    { label: "不足 6 小时", urgent: true },
  );
  assert.equal(
    resolveImageExpiryBadge({
      cloudStorageEnabled: true,
      scope: "public",
      expiresAt: inTwoDays,
      nowMs,
    }),
    null,
  );

  assert.equal(parseAssetsScope("all", false), "mine");
  assert.equal(parseAssetsScope("all", true), "all");
  assert.equal(resolveAssetOrientation({ size: "1536x1024" }), "landscape");
  assert.equal(resolveAssetOrientation({ aspectRatio: "9:16" }), "portrait");
  assert.equal(resolveAssetOrientation({ width: 1024, height: 1024 }), "square");
});

test("storage admin fallback uses free_retention_days = 3 and user views gate VIP UI on cloudStorageEnabled", async () => {
  const adminStorageSource = await readFile(
    new URL("../src/app/admin/settings/storage/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminStorageSource, /free_retention_days:\s*3/);
  assert.match(adminStorageSource, /vip_grace_days:\s*7/);
  assert.match(adminStorageSource, /historical_grace_days:\s*7/);

  const vipCardSource = await readFile(
    new URL("../src/app/assets/assets-vip-status-card.tsx", import.meta.url),
    "utf8",
  );
  assert.match(vipCardSource, /if\s*\(!cloudStorageEnabled\)\s*\{\s*return\s+null;/);

  const walletSource = await readFile(
    new URL("../src/app/wallet/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(walletSource, /cloudStorageEnabled\s*&&\s*activeTab\s*===\s*"storage"/);

  const adminPaymentsSource = await readFile(
    new URL("../src/app/admin/payments/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminPaymentsSource, /free_retention_days\s*\?\?\s*3/);
  assert.match(adminPaymentsSource, /hideCloudStorageToggle/);
});

test("post-overhaul polish fixes login banner z-index, user task popover links, studio CTA, and admin slide drawers", async () => {
  const appShellSource = await readFile(
    new URL("../src/app/app-shell.tsx", import.meta.url),
    "utf8",
  );
  const loginPageSource = await readFile(
    new URL("../src/app/login/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(appShellSource, /BannerAnnouncementsBar/);
  assert.match(loginPageSource, /BannerAnnouncementsBar\s+target="login"/);

  const taskQueueSource = await readFile(
    new URL("../src/components/image-task-queue.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(taskQueueSource, /navigate\(["']\/task-queue["']\)/);
  assert.doesNotMatch(taskQueueSource, /navigate\(["']\/image-manager["']\)/);
  assert.match(taskQueueSource, /navigate\(["']\/tasks["']\)/);
  assert.match(taskQueueSource, /navigate\(["']\/assets\?type=image["']\)/);

  const landingCtaSource = await readFile(
    new URL("../src/app/landing/landing-cta.tsx", import.meta.url),
    "utf8",
  );
  assert.match(landingCtaSource, /returnTo=%2Fimage/);

  const channelDialogSource = await readFile(
    new URL("../src/app/settings/components/image-channel-dialog.tsx", import.meta.url),
    "utf8",
  );
  const productDialogSource = await readFile(
    new URL("../src/app/payment-admin/payment-product-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(channelDialogSource, /AdminSlideDrawer/);
  assert.match(productDialogSource, /AdminSlideDrawer/);

  const routeComponentsSource = await readFile(
    new URL("../src/app/route-components.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(routeComponentsSource, /ImageManagerPage|RechargePage|VideoLibraryPage/);
});

test("stage-6 QA fixes config deadlock, admin token aliases, R2 same-origin proxy, assets RBAC delete, and single modal", async () => {
  const settingsStoreConfig = await readFile(
    new URL("../src/app/settings/settings-store-config.ts", import.meta.url),
    "utf8",
  );
  assert.match(settingsStoreConfig, /isLoadingConfig:\s*false/);
  assert.match(settingsStoreConfig, /media_r2_secret_access_key_configured/);

  const adminTokensCss = await readFile(
    new URL("../src/styles/admin-tokens.css", import.meta.url),
    "utf8",
  );
  assert.match(adminTokensCss, /--admin-bg:\s*var\(--admin-canvas\)/);
  assert.match(adminTokensCss, /--admin-text-subtle:\s*var\(--admin-text-placeholder\)/);
  assert.match(adminTokensCss, /--admin-success:\s*var\(--admin-status-success\)/);
  assert.match(adminTokensCss, /--admin-danger:\s*var\(--admin-status-error\)/);

  const mediaFetchSource = await readFile(
    new URL("../src/lib/media-fetch.ts", import.meta.url),
    "utf8",
  );
  assert.match(mediaFetchSource, /proxy/);

  const assetsPageSource = await readFile(
    new URL("../src/app/assets/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(assetsPageSource, /hasAPIPermission\(session,\s*"DELETE",\s*"\/api\/images"\)/);

  const workspaceShellSource = await readFile(
    new URL("../src/components/workspace/workspace-shell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceShellSource, /triggerless/);
});
