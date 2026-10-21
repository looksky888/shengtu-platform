import type { ImageTaskTodayStats } from "@/lib/api";

const FAB_POS_KEY = "chatgpt2api:studio-stats-fab-pos";

export type FabPosition = { x: number; y: number };

export type StudioStatsView = {
  successImages: number;
  failedImages: number;
  successTasks: number;
  failedTasks: number;
  successRate: number;
  dateLabel: string;
  rangeLabel: string;
  updatedAt: string;
};

export function emptyStudioStatsView(): StudioStatsView {
  return {
    successImages: 0,
    failedImages: 0,
    successTasks: 0,
    failedTasks: 0,
    successRate: 0,
    dateLabel: "—",
    rangeLabel: "中国时间",
    updatedAt: "",
  };
}

export function mapLedgerStats(stats: ImageTaskTodayStats | null | undefined): StudioStatsView {
  if (!stats) return emptyStudioStatsView();
  const successImages = Number(stats.success_images) || 0;
  const failedImages = Number(stats.failed_images) || 0;
  const decided = successImages + failedImages;
  const start = stats.start_date || stats.date || "";
  const end = stats.end_date || stats.date || "";
  const rangeLabel =
    start && end && start !== end ? `${start} 至 ${end} · 中国时间` : start ? `${start} · 中国时间` : "中国时间";
  return {
    successImages,
    failedImages,
    successTasks: Number(stats.success_tasks) || 0,
    failedTasks: Number(stats.failed_tasks) || 0,
    successRate: decided > 0 ? successImages / decided : 0,
    dateLabel: stats.date || start || "—",
    rangeLabel,
    updatedAt: stats.updated_at || "",
  };
}

export function loadFabPosition(): FabPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAB_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FabPosition;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFabPosition(pos: FabPosition) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos));
  } catch {
    // Ignore storage access errors.
  }
}

export function defaultFabPosition(size = 64, margin = 24): FabPosition {
  if (typeof window === "undefined") return { x: margin, y: margin };
  const isMobile = window.innerWidth < 640;
  // Offset vertically above the bottom composer dock so the FAB never blocks the send button
  const bottomClearance = isMobile ? 210 : 148;
  return {
    x: Math.max(margin, window.innerWidth - size - margin),
    y: Math.max(margin, window.innerHeight - size - bottomClearance),
  };
}

export function clampFabPosition(pos: FabPosition, size = 64, margin = 8): FabPosition {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(margin, window.innerWidth - size - margin);
  const maxY = Math.max(margin, window.innerHeight - size - margin);
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y)),
  };
}

export function snapFabToEdge(pos: FabPosition, size = 64, margin = 16): FabPosition {
  if (typeof window === "undefined") return pos;
  const mid = pos.x + size / 2;
  const x = mid < window.innerWidth / 2 ? margin : window.innerWidth - size - margin;
  return clampFabPosition({ x, y: pos.y }, size, 8);
}

export function formatPercent(rate: number) {
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.floor(value || 0)));
}

/** Compact count for the floating ball center (keeps 2-line layout readable). */
export function formatBallCount(value: number) {
  const n = Math.max(0, Math.floor(value || 0));
  if (n >= 100_000) return `${Math.round(n / 10_000)}万`;
  if (n >= 10_000) {
    const text = (n / 10_000).toFixed(1);
    return `${text.endsWith(".0") ? text.slice(0, -2) : text}万`;
  }
  if (n >= 1000) {
    const text = (n / 1000).toFixed(1);
    return `${text.endsWith(".0") ? text.slice(0, -2) : text}k`;
  }
  return String(n);
}

export function isElevatedFailRate(successImages: number, failedImages: number) {
  const total = successImages + failedImages;
  if (total < 3) return false;
  return failedImages / total >= 0.35;
}
