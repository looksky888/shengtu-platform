import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMAGE_COUNT,
  MIN_IMAGE_COUNT,
  isRetryableSubmitCapacityError,
  normalizeRequestedImageCount,
  sanitizeImageCountInput,
} from "../src/app/image/lib/image-count-utils.ts";
import {
  computeScrollRailThumb,
  isViewportOverflowing,
  scrollTopForThumbDrag,
  scrollTopForTrackClick,
} from "../src/app/image/lib/image-scroll-rail-math.ts";

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

test("scroll rail math hides on short content and computes accurate thumb & drag offsets on 50+ rounds", () => {
  assert.equal(isViewportOverflowing(600, 600), false);
  assert.equal(isViewportOverflowing(620, 600), false);
  assert.equal(isViewportOverflowing(1800, 600), true);

  const midMetrics = computeScrollRailThumb({
    scrollTop: 12000,
    scrollHeight: 24600,
    clientHeight: 600,
    trackHeight: 400,
  });

  assert.equal(midMetrics.maxScroll, 24000);
  assert.equal(midMetrics.percent, 50);
  assert.equal(midMetrics.thumbHeight, 38);
  assert.equal(midMetrics.travel, 362);
  assert.equal(midMetrics.thumbTop, 181);

  const clickedBottom = scrollTopForTrackClick({
    clickOffsetY: 395,
    thumbHeight: midMetrics.thumbHeight,
    travel: midMetrics.travel,
    maxScroll: midMetrics.maxScroll,
  });
  assert.equal(clickedBottom, 24000);

  const clickedTop = scrollTopForTrackClick({
    clickOffsetY: 5,
    thumbHeight: midMetrics.thumbHeight,
    travel: midMetrics.travel,
    maxScroll: midMetrics.maxScroll,
  });
  assert.equal(clickedTop, 0);

  const draggedToQuarter = scrollTopForThumbDrag({
    startScrollTop: 12000,
    deltaY: -midMetrics.travel / 4,
    travel: midMetrics.travel,
    maxScroll: midMetrics.maxScroll,
  });
  assert.equal(Math.round(draggedToQuarter), 6000);
});
