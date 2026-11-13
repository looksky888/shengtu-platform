import type { CreationTask } from "../../../lib/api-types";

export type OverviewCapabilityFilter = "all" | "image" | "video";

export const OVERVIEW_BUILTIN_CHANNELS = [
  { value: "account_pool", label: "本地号池 (GPT)" },
  { value: "grok_runtime", label: "Grok 号池" },
  { value: "proxy_api", label: "全局默认中转" },
] as const;

type ChannelAwareTask = Pick<
  CreationTask,
  "effective_channel" | "effective_provider"
> & {
  channel_id?: string;
};

export function isOverviewVideoTask(
  task: CreationTask,
  isVideoModelId: (model: string | null | undefined) => boolean = (m) =>
    String(m || "").trim().toLowerCase().includes("video"),
): boolean {
  return (
    task.mode === "video" ||
    task.output_type === "video" ||
    isVideoModelId(task.effective_model || task.model || "")
  );
}

/**
 * Matches admin overview channel filter against both built-in providers
 * (account_pool / grok_runtime / proxy_api) and custom image channels
 * whose backend tasks store `effective_channel = "image_channel:<id>"`.
 */
export function matchesOverviewChannelFilter(
  task: ChannelAwareTask,
  channelFilter: string,
): boolean {
  const filter = channelFilter.trim();
  if (!filter || filter === "all") return true;

  const channelId = String(task.channel_id || "").trim();
  const effectiveChannel = String(task.effective_channel || "").trim();
  const effectiveProvider = String(task.effective_provider || "").trim();

  if (filter === "account_pool") {
    return (
      effectiveProvider === "account_pool" ||
      effectiveChannel === "chatgpt_account_pool" ||
      effectiveChannel === "account_pool" ||
      (!effectiveProvider && !effectiveChannel && !channelId)
    );
  }
  if (filter === "grok_runtime") {
    return (
      effectiveProvider === "grok_runtime" ||
      effectiveChannel === "grok_runtime"
    );
  }
  if (filter === "proxy_api") {
    return (
      effectiveChannel === "openai_compatible_proxy" ||
      effectiveChannel === "proxy_api" ||
      (effectiveProvider === "proxy_api" &&
        !effectiveChannel.startsWith("image_channel:") &&
        !channelId)
    );
  }

  return (
    channelId === filter ||
    effectiveChannel === filter ||
    effectiveChannel === `image_channel:${filter}` ||
    effectiveProvider === filter
  );
}

const CHINA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CHINA_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * Normalizes backend timestamps ("YYYY-MM-DD HH:MM:SS" in China time or ISO strings)
 * into a YYYY-MM-DD key in Asia/Shanghai.
 */
export function chinaCalendarDateKey(
  value?: string | Date | null,
): string {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : CHINA_DATE_FORMATTER.format(value);
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(text)) {
    return text.slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : CHINA_DATE_FORMATTER.format(parsed);
}

/**
 * Normalizes backend timestamps into a 3-hour slot ("00:00" .. "21:00") in Asia/Shanghai.
 */
export function chinaThreeHourSlotLabel(value?: string | Date | null): string {
  if (!value) return "";
  let hour = 0;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    hour = Number(CHINA_HOUR_FORMATTER.format(value)) || 0;
  } else {
    const text = String(value).trim();
    const localMatch = text.match(/^\d{4}-\d{2}-\d{2}(?:[ T](\d{2}):\d{2}:\d{2}(?:\.\d+)?)?$/);
    if (localMatch) {
      hour = Number(localMatch[1] || 0);
    } else {
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return "";
      hour = Number(CHINA_HOUR_FORMATTER.format(parsed)) || 0;
    }
  }
  const slot = Math.floor(Math.max(0, Math.min(23, hour)) / 3) * 3;
  return `${String(slot).padStart(2, "0")}:00`;
}

export function summarizeFilteredTodayImageCounts(
  tasks: CreationTask[],
  capability: OverviewCapabilityFilter,
  referenceDate: Date = new Date(),
  isVideoModelId?: (model: string | null | undefined) => boolean,
): { todayImages: number; todayFailedImages: number } {
  const todayKey = chinaCalendarDateKey(referenceDate);
  let todayImages = 0;
  let todayFailedImages = 0;

  for (const task of tasks) {
    if (capability !== "video" && isOverviewVideoTask(task, isVideoModelId)) {
      continue;
    }
    const timestamp = task.finished_at || task.updated_at || task.created_at;
    if (chinaCalendarDateKey(timestamp) !== todayKey) {
      continue;
    }
    const requested = Math.max(1, Number(task.count) || 1);
    const delivered = Array.isArray(task.data) ? task.data.length : 0;
    if (task.status === "success") {
      todayImages += delivered > 0 ? delivered : requested;
      if (delivered > 0 && delivered < requested) {
        todayFailedImages += requested - delivered;
      }
    } else if (task.status === "error") {
      if (delivered > 0) {
        todayImages += delivered;
      }
      todayFailedImages += Math.max(0, requested - delivered);
    }
  }

  return { todayImages, todayFailedImages };
}
