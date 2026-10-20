/** Business display timezone for all user-facing timestamps. */
export const BIZ_TIME_ZONE = "Asia/Shanghai";

/**
 * Parse API timestamps.
 * - ISO with Z / offset → absolute instant
 * - Naive "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DDTHH:mm:ss" → China wall clock (+08:00)
 */
export function parseDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasZone) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  // Backend NowLocal stores China wall-clock without offset.
  const date = new Date(`${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

type FormatDateTimeOptions = {
  /** Include seconds (default true for task queues, false for compact UI). */
  withSeconds?: boolean;
  /** Compact: omit year (month-day hour:minute). */
  compact?: boolean;
};

/** Format a timestamp in Asia/Shanghai (中国时间). */
export function formatDateTime(value?: string | null, options: FormatDateTimeOptions = {}) {
  if (!value) return "—";
  const date = parseDateTime(value);
  if (!date) return value;

  const { withSeconds = true, compact = false } = options;
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BIZ_TIME_ZONE,
    ...(compact
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          ...(withSeconds ? { second: "2-digit" as const } : {}),
        }),
    hour12: false,
  }).format(date);

  return formatted.replace(/\//g, "-");
}

/** Current calendar day in Asia/Shanghai as YYYY-MM-DD. */
export function chinaTodayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BIZ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Start of "today" in Asia/Shanghai as epoch ms (UTC instant). */
export function chinaTodayStartMs(now = new Date()) {
  const day = chinaTodayKey(now);
  return new Date(`${day}T00:00:00+08:00`).getTime();
}

export type TimeRangeFilter = "all" | "today" | "7d" | "30d";

/** mm:ss (or hh:mm:ss past an hour) elapsed clock used by the task queue and result cards. */
export function formatElapsedClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Whether a timestamp falls in the China-time filter window. */
export function isWithinChinaTimeFilter(value: string | null | undefined, filter: TimeRangeFilter) {
  if (filter === "all") return true;
  if (!value) return false;
  const date = parseDateTime(value);
  if (!date) return false;
  const time = date.getTime();
  if (filter === "today") {
    return time >= chinaTodayStartMs();
  }
  const days = filter === "7d" ? 7 : 30;
  return time >= Date.now() - days * 24 * 60 * 60 * 1000;
}
