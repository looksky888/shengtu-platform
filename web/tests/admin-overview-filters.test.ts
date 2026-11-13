import assert from "node:assert/strict";
import test from "node:test";

import {
  chinaCalendarDateKey,
  matchesOverviewChannelFilter,
  summarizeFilteredTodayImageCounts,
} from "../src/app/admin/overview/overview-filters.ts";

function makeTask(partial: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    status: "success" as const,
    mode: "generate",
    model: "gpt-image-1",
    created_at: "2026-11-13 10:00:00",
    updated_at: "2026-11-13 10:01:00",
    ...partial,
  };
}

test("matchesOverviewChannelFilter matches custom relay channels with image_channel prefix", () => {
  const relayTask = makeTask({
    effective_provider: "proxy_api",
    effective_channel: "image_channel:ch_custom_1",
  });

  assert.equal(matchesOverviewChannelFilter(relayTask, "ch_custom_1"), true);
  assert.equal(matchesOverviewChannelFilter(relayTask, "ch_other"), false);
  assert.equal(matchesOverviewChannelFilter(relayTask, "proxy_api"), false);
  assert.equal(matchesOverviewChannelFilter(relayTask, "account_pool"), false);
  assert.equal(matchesOverviewChannelFilter(relayTask, "all"), true);
});

test("matchesOverviewChannelFilter matches built-in channels accurately", () => {
  const localPoolTask = makeTask({
    effective_provider: "account_pool",
    effective_channel: "chatgpt_account_pool",
  });
  const grokTask = makeTask({
    effective_provider: "grok_runtime",
    effective_channel: "grok_runtime",
  });
  const globalProxyTask = makeTask({
    effective_provider: "proxy_api",
    effective_channel: "openai_compatible_proxy",
  });

  assert.equal(matchesOverviewChannelFilter(localPoolTask, "account_pool"), true);
  assert.equal(matchesOverviewChannelFilter(grokTask, "grok_runtime"), true);
  assert.equal(matchesOverviewChannelFilter(globalProxyTask, "proxy_api"), true);
  assert.equal(matchesOverviewChannelFilter(globalProxyTask, "account_pool"), false);
});

test("summarizeFilteredTodayImageCounts counts today's custom relay images and skips video", () => {
  const refDate = new Date("2026-11-13T04:00:00Z"); // 2026-11-13 12:00:00 CST
  assert.equal(chinaCalendarDateKey("2026-11-13 08:30:00"), "2026-11-13");

  const result = summarizeFilteredTodayImageCounts(
    [
      makeTask({
        id: "ok-1",
        status: "success",
        count: 2,
        effective_channel: "image_channel:ch_custom_1",
        finished_at: "2026-11-13 11:20:00",
      }),
      makeTask({
        id: "err-1",
        status: "error",
        count: 1,
        effective_channel: "image_channel:ch_custom_1",
        finished_at: "2026-11-13 11:25:00",
      }),
      makeTask({
        id: "yesterday-1",
        status: "success",
        count: 5,
        finished_at: "2026-11-12 23:50:00",
      }),
      makeTask({
        id: "video-1",
        mode: "video",
        output_type: "video",
        status: "success",
        count: 1,
        finished_at: "2026-11-13 11:30:00",
      }),
    ],
    "all",
    refDate,
  );

  assert.deepEqual(result, {
    todayImages: 2,
    todayFailedImages: 1,
  });
});
