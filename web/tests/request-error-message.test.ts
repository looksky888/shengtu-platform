import assert from "node:assert/strict";
import test from "node:test";

import { resolveRequestErrorDetails } from "../src/lib/request-error-message.ts";

test("preserves backend JSON error message and code on 422", () => {
  const got = resolveRequestErrorDetails(
    {
      success: false,
      code: "imap_email_typo",
      message: "邮箱域名疑似填写错误（当前为 l3579524213@icoud.com，应为 @icloud.com）",
    },
    422,
    "Request failed with status code 422",
  );
  assert.equal(got.code, "imap_email_typo");
  assert.match(got.message, /@icloud\.com/);
});

test("translates Cloudflare RFC 9457 Problem Details JSON into friendly Chinese message", () => {
  const got = resolveRequestErrorDetails(
    {
      title: "Error 502: Bad gateway",
      type: "https://developers.cloudflare.com/errors/origin_bad_gateway/",
      status: 502,
      detail:
        "The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.",
      cloudflare_error: true,
      error_source: "origin",
    },
    502,
    "Request failed with status code 502",
  );
  assert.equal(got.code, "cloudflare_edge_error");
  assert.doesNotMatch(got.message, /invalid or incomplete response/i);
  assert.match(got.message, /Cloudflare HTTP 502/);
});
