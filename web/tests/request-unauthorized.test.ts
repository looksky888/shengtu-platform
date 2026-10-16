import assert from "node:assert/strict";
import test from "node:test";

import {
  redirectAndRejectUnauthorized,
  shouldRedirectUnauthorized,
  UnauthorizedRedirectError,
} from "../src/lib/request-unauthorized.ts";

test("401 redirect policy keeps opt-out and login-page behavior", () => {
  assert.equal(shouldRedirectUnauthorized(401, undefined, "/accounts"), true);
  assert.equal(shouldRedirectUnauthorized(401, false, "/accounts"), false);
  assert.equal(shouldRedirectUnauthorized(401, true, "/login"), false);
  assert.equal(shouldRedirectUnauthorized(403, true, "/accounts"), false);
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
