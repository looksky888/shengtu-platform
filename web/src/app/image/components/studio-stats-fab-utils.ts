import type { ImageTaskTodayStats } from "@/lib/api";

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

export function formatPercent(rate: number) {
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.floor(value || 0)));
}

export function isElevatedFailRate(successImages: number, failedImages: number) {
  const total = successImages + failedImages;
  if (total < 3) return false;
  return failedImages / total >= 0.35;
}
