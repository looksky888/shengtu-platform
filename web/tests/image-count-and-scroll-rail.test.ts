import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMAGE_COUNT,
  MIN_IMAGE_COUNT,
  isRetryableSubmitCapacityError,
  normalizeRequestedImageCount,
  sanitizeImageCountInput,
} from "../src/app/image/lib/image-count-utils.ts";

test("image count helpers allow any integer from 1 to 15 and clamp out-of-range inputs", () => {
  assert.equal(MIN_IMAGE_COUNT, 1);
  assert.equal(MAX_IMAGE_COUNT, 15);

  for (let count = 1; count <= 15; count += 1) {
    assert.equal(normalizeRequestedImageCount(count), count);
    assert.equal(normalizeRequestedImageCount(String(count)), count);
    assert.equal(sanitizeImageCountInput(String(count)), String(count));
  }

  assert.equal(normalizeRequestedImageCount(0), 1);
  assert.equal(normalizeRequestedImageCount(-5), 1);
  assert.equal(normalizeRequestedImageCount(""), 1);
  assert.equal(normalizeRequestedImageCount(16), 15);
  assert.equal(normalizeRequestedImageCount("99"), 15);

  assert.equal(sanitizeImageCountInput(""), "");
  assert.equal(sanitizeImageCountInput("abc"), "");
  assert.equal(sanitizeImageCountInput("0"), "1");
  assert.equal(sanitizeImageCountInput("09"), "9");
  assert.equal(sanitizeImageCountInput("15"), "15");
  assert.equal(sanitizeImageCountInput("16"), "15");
  assert.equal(sanitizeImageCountInput("120"), "15");
});

test("isRetryableSubmitCapacityError distinguishes concurrency/RPM limits from billing and daily quota errors", () => {
  assert.equal(isRetryableSubmitCapacityError({ status: 429, message: "Too Many Requests" }), true);
  assert.equal(isRetryableSubmitCapacityError(new Error("用户并发限制已达到（最多 4 个任务处理中）")), true);
  assert.equal(isRetryableSubmitCapacityError(new Error("用户 RPM 速率限制已达到（每分钟最多 10 次）")), true);
  assert.equal(isRetryableSubmitCapacityError({ status: 429, message: "今日消费额度已用尽，请明日再试" }), false);
  assert.equal(isRetryableSubmitCapacityError({ status: 429, message: "API Key 每日请求配额已用尽" }), false);
  assert.equal(isRetryableSubmitCapacityError({ status: 429, message: "insufficient_quota: daily limit reached" }), false);
  assert.equal(isRetryableSubmitCapacityError({ status: 402, message: "积分余额不足" }), false);
  assert.equal(isRetryableSubmitCapacityError(new Error("请填写提示词")), false);
});
