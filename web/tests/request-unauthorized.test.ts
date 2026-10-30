import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLoginRedirectUrl,
  extractReturnToFromSearch,
  isSessionInvalidError,
  redirectAndRejectUnauthorized,
  resolvePostAuthDestination,
  sanitizeInternalReturnPath,
  shouldRedirectUnauthorized,
  UnauthorizedRedirectError,
} from "../src/lib/request-unauthorized.ts";

test("401 redirect policy keeps opt-out and login-page behavior", () => {
  assert.equal(shouldRedirectUnauthorized(401, undefined, "/accounts"), true);
  assert.equal(shouldRedirectUnauthorized(401, false, "/accounts"), false);
  assert.equal(shouldRedirectUnauthorized(401, true, "/login"), false);
  assert.equal(shouldRedirectUnauthorized(403, true, "/accounts"), false);
});

test("sanitizeInternalReturnPath accepts internal routes and rejects open redirects or loops", () => {
  assert.equal(sanitizeInternalReturnPath("/settings?tab=storage#backup"), "/settings?tab=storage#backup");
  assert.equal(sanitizeInternalReturnPath("/recharge/"), "/recharge");
  assert.equal(sanitizeInternalReturnPath(""), "");
  assert.equal(sanitizeInternalReturnPath("/"), "");
  assert.equal(sanitizeInternalReturnPath("/login?returnTo=/image"), "");
  assert.equal(sanitizeInternalReturnPath("https://evil.example/steal"), "");
  assert.equal(sanitizeInternalReturnPath("//evil.example/steal"), "");
  assert.equal(sanitizeInternalReturnPath("/\\evil.example/steal"), "");
  assert.equal(sanitizeInternalReturnPath("javascript:alert(1)"), "");
});

test("buildLoginRedirectUrl and extractReturnToFromSearch preserve deep links safely", () => {
  const loginUrl = buildLoginRedirectUrl("/settings?tab=storage");
  assert.equal(loginUrl, "/login?returnTo=%2Fsettings%3Ftab%3Dstorage");
  assert.equal(extractReturnToFromSearch(loginUrl.slice("/login".length)), "/settings?tab=storage");
  assert.equal(buildLoginRedirectUrl("/"), "/login");
  assert.equal(buildLoginRedirectUrl("/login"), "/login");
  assert.equal(extractReturnToFromSearch("?returnTo=https://evil.example"), "");
});

test("resolvePostAuthDestination honors RBAC on returnTo, then pendingPrompt, then defaultRoute", () => {
  assert.equal(
    resolvePostAuthDestination({
      returnTo: "/settings?tab=storage",
      pendingPrompt: "neon city",
      canAccess: (pathname) => pathname === "/settings" || pathname === "/image",
      defaultRoute: "/accounts",
    }),
    "/settings?tab=storage",
  );
  assert.equal(
    resolvePostAuthDestination({
      returnTo: "/accounts",
      pendingPrompt: "neon city",
      canAccess: (pathname) => pathname === "/image",
      defaultRoute: "/image",
    }),
    "/image?prompt=neon%20city",
  );
  assert.equal(
    resolvePostAuthDestination({
      returnTo: "//evil.example",
      pendingPrompt: "",
      canAccess: () => false,
      defaultRoute: "/profile",
    }),
    "/profile",
  );
});

test("isSessionInvalidError distinguishes 401 from 502/503 HTML SyntaxError", () => {
  assert.equal(isSessionInvalidError(new UnauthorizedRedirectError()), true);
  assert.equal(isSessionInvalidError(Object.assign(new Error("Request failed"), { status: 401 })), true);
  assert.equal(isSessionInvalidError(Object.assign(new Error("Bad Gateway"), { status: 502 })), false);
  assert.equal(isSessionInvalidError(Object.assign(new Error("Service Unavailable"), { status: 503 })), false);
  assert.equal(
    isSessionInvalidError(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")),
    false,
  );
});

test("401 redirect rejects after clearing session", async () => {
  const steps: string[] = [];
  await assert.rejects(
    redirectAndRejectUnauthorized(
      async () => {
        steps.push("clear");
      },
      () => steps.push("redirect"),
    ),
    UnauthorizedRedirectError,
  );
  assert.deepEqual(steps, ["clear", "redirect"]);
});

test("401 redirect still runs and settles when session cleanup fails", async () => {
  let redirected = false;
  await assert.rejects(
    redirectAndRejectUnauthorized(
      async () => {
        throw new Error("storage failure");
      },
      () => {
        redirected = true;
      },
    ),
    /storage failure/,
  );
  assert.equal(redirected, true);
});
