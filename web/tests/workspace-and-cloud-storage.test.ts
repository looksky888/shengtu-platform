import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveRoutePageTitle } from "../src/components/top-nav-config.ts";
import { resolveImageExpiryBadge } from "../src/lib/media-cloud-policy.ts";
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

test("RBAC permissions align /wallet with /recharge, /image-manager with /image, and Classic default route priority", () => {
  const videoOnlySession = buildSession(["/video"]);
  assert.equal(canAccessPath(videoOnlySession, "/video-library"), true);
  assert.equal(canAccessPath(videoOnlySession, "/image-manager"), false);
  assert.equal(canAccessPath(videoOnlySession, "/tasks"), true);
  assert.equal(canAccessPath(videoOnlySession, "/assets"), true);
  assert.equal(canAccessPath(videoOnlySession, "/wallet"), false);
  assert.equal(canAccessPath(videoOnlySession, "/recharge"), false);
  assert.equal(canAccessPath(videoOnlySession, "/profile"), true);
  assert.equal(getDefaultRouteForSession(videoOnlySession), "/video");

  const imageOnlySession = buildSession(["/image"]);
  assert.equal(canAccessPath(imageOnlySession, "/image-manager"), true);
  assert.equal(canAccessPath(imageOnlySession, "/assets"), true);
  assert.equal(getDefaultRouteForSession(imageOnlySession), "/image");

  const gallerySession = buildSession(["/image-manager", "/recharge"]);
  assert.equal(canAccessPath(gallerySession, "/image-manager"), true);
  assert.equal(canAccessPath(gallerySession, "/recharge"), true);
  assert.equal(canAccessPath(gallerySession, "/wallet"), true);
  assert.equal(canAccessPath(gallerySession, "/assets"), true);
  assert.equal(getDefaultRouteForSession(gallerySession), "/image-manager");

  const rechargeOnlySession = buildSession(["/recharge"]);
  assert.equal(canAccessPath(rechargeOnlySession, "/wallet"), true);
  assert.equal(getDefaultRouteForSession(rechargeOnlySession), "/recharge");

  assert.equal(resolveRoutePageTitle("/image-manager"), "图片库");
  assert.equal(resolveRoutePageTitle("/video-library"), "视频库");
  assert.equal(resolveRoutePageTitle("/recharge"), "充值中心");
});

test("media cloud policy strictly hides countdown badges when cloudStorageEnabled is false or scope is public", () => {
  const nowMs = Date.parse("2026-05-01T00:00:00Z");
  const inTwoDays = "2026-05-03T00:00:00Z";
  const inSixHours = "2026-05-01T06:00:00Z";
  const expired = "2026-04-30T23:00:00Z";

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
  assert.deepEqual(
    resolveImageExpiryBadge({
      cloudStorageEnabled: true,
      scope: "mine",
      expiresAt: expired,
      nowMs,
    }),
    { label: "即将清理", urgent: true },
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
});

test("storage admin fallback uses free_retention_days = 3 and payment-admin always enforces hideCloudStorageToggle", async () => {
  const adminStorageSource = await readFile(
    new URL("../src/app/admin/settings/storage/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminStorageSource, /free_retention_days:\s*3/);
  assert.match(adminStorageSource, /vip_grace_days:\s*7/);
  assert.match(adminStorageSource, /historical_grace_days:\s*7/);

  const vipCardSource = await readFile(
    new URL("../src/components/assets-vip-status-card.tsx", import.meta.url),
    "utf8",
  );
  assert.match(vipCardSource, /if\s*\(!cloudStorageEnabled\)\s*\{\s*return\s+null;/);
  assert.match(vipCardSource, /\/recharge\?tab=storage/);

  const rechargePageSource = await readFile(
    new URL("../src/app/recharge/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(rechargePageSource, /cloudStorageEnabled/);
  assert.match(rechargePageSource, /StorageEntitlementPanel/);

  const paymentAdminSource = await readFile(
    new URL("../src/app/payment-admin/payment-admin-content.tsx", import.meta.url),
    "utf8",
  );
  assert.match(paymentAdminSource, /free_retention_days\s*\?\?\s*3/);
  assert.match(paymentAdminSource, /hideCloudStorageToggle=\{true\}/);
  assert.doesNotMatch(paymentAdminSource, /hideCloudStorageToggle=\{!cloudStorageEnabled\}/);
  assert.match(paymentAdminSource, /\/settings\?tab=media/);

  const paymentSettingsSectionSource = await readFile(
    new URL("../src/app/payment-admin/payment-settings-section.tsx", import.meta.url),
    "utf8",
  );
  assert.match(paymentSettingsSectionSource, /hideCloudStorageToggle\s*=\s*true/);
  assert.match(
    paymentSettingsSectionSource,
    /cloud_storage_enabled:\s*latest\.cloud_storage_enabled/,
  );
});

test("Classic AppShell lazy-loads chrome, LoginPage, LandingCTA, standalone routes, GIF/R2 image-manager, and Light-First admin tokens are wired cleanly", async () => {
  const appShellSource = await readFile(
    new URL("../src/app/app-shell.tsx", import.meta.url),
    "utf8",
  );
  const loginPageSource = await readFile(
    new URL("../src/app/login/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(appShellSource, /BannerAnnouncementsBar\s+target="image"/);
  assert.match(appShellSource, /TopNav/);
  assert.match(appShellSource, /lazy\(/);
  assert.match(loginPageSource, /BannerAnnouncementsBar\s+target="login"/);

  const taskQueueSource = await readFile(
    new URL("../src/components/image-task-queue.tsx", import.meta.url),
    "utf8",
  );
  assert.match(taskQueueSource, /\/image-manager/);
  assert.match(taskQueueSource, /\/task-queue/);

  const landingCtaSource = await readFile(
    new URL("../src/app/landing/landing-cta.tsx", import.meta.url),
    "utf8",
  );
  assert.match(landingCtaSource, /returnTo=%2Fimage/);

  const routeComponentsSource = await readFile(
    new URL("../src/app/route-components.tsx", import.meta.url),
    "utf8",
  );
  assert.match(routeComponentsSource, /ImageManagerPage/);
  assert.match(routeComponentsSource, /RechargePage/);
  assert.match(routeComponentsSource, /VideoLibraryPage/);
  assert.doesNotMatch(routeComponentsSource, /RegisterPage/);

  const imageManagerCardSource = await readFile(
    new URL("../src/app/image-manager/image-manager-image-card.tsx", import.meta.url),
    "utf8",
  );
  assert.match(imageManagerCardSource, /buildSameOriginImageProxySrc/);
  assert.match(imageManagerCardSource, /copyText/);
  assert.match(imageManagerCardSource, /GIF/);

  const imageManagerPageSource = await readFile(
    new URL("../src/app/image-manager/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    imageManagerPageSource,
    /hasAPIPermission\(session,\s*"DELETE",\s*"\/api\/images"\)/,
  );

  const adminTokensCss = await readFile(
    new URL("../src/styles/admin-tokens.css", import.meta.url),
    "utf8",
  );
  assert.match(adminTokensCss, /--admin-canvas:\s*#f6f8fc/i);
  assert.match(adminTokensCss, /--admin-accent:\s*#1456f0/i);
  assert.match(adminTokensCss, /--admin-bg:\s*var\(--admin-canvas\)/);
  assert.match(adminTokensCss, /--admin-text-subtle:\s*var\(--admin-text-placeholder\)/);
  assert.match(adminTokensCss, /--admin-success:\s*var\(--admin-status-success\)/);
  assert.match(adminTokensCss, /--admin-danger:\s*var\(--admin-status-error\)/);
});
