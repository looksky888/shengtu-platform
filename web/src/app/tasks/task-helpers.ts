import type { SubNavItem } from "@/components/ui/sub-nav";
import type { CreationTask } from "@/lib/api-types";

export type TaskStatusTab = "all" | "active" | "succeeded" | "failed";
export type TaskKindFilter = "all" | "image" | "video";
export type TaskViewMode = "list" | "grid";

export const STATUS_TABS: SubNavItem<TaskStatusTab>[] = [
  { value: "all", label: "全部任务" },
  { value: "active", label: "进行中" },
  { value: "succeeded", label: "已完成" },
  { value: "failed", label: "异常记录" },
];

export function parseStatusTab(raw: string | null): TaskStatusTab {
  if (raw === "active" || raw === "succeeded" || raw === "failed") return raw;
  return "all";
}

export function isTaskActive(status: string): boolean {
  return status === "queued" || status === "running" || status === "in_progress";
}

export function isTaskSucceeded(status: string): boolean {
  return (
    status === "success" || status === "succeeded" || status === "completed"
  );
}

export function isTaskFailedOrCancelled(status: string): boolean {
  return status === "error" || status === "failed" || status === "cancelled";
}

export function formatTaskModeLabel(task: CreationTask): string {
  switch (task.mode) {
    case "video":
      return "视频生成";
    case "edit":
      return "图生图";
    case "chat":
      return "AI 对话";
    case "response-image":
      return "多模态生图";
    case "generate":
    default:
      return "文生图";
  }
}

export function resolveTaskStatusBadge(status: string): {
  label: string;
  dotClass: string;
  pillClass: string;
} {
  if (status === "running" || status === "in_progress") {
    return {
      label: "生成中",
      dotClass: "bg-sky-400 animate-pulse",
      pillClass:
        "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:border-sky-400/30 dark:text-sky-300",
    };
  }
  if (status === "queued") {
    return {
      label: "排队中",
      dotClass: "bg-amber-400 animate-pulse",
      pillClass:
        "border-amber-500/35 bg-amber-500/12 text-amber-800 dark:border-amber-400/30 dark:text-amber-300",
    };
  }
  if (isTaskSucceeded(status)) {
    return {
      label: "已完成",
      dotClass: "bg-emerald-400",
      pillClass:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:text-emerald-300",
    };
  }
  if (status === "cancelled") {
    return {
      label: "已取消",
      dotClass: "bg-zinc-400",
      pillClass: "border-border/70 bg-surface-muted text-muted-foreground",
    };
  }
  return {
    label: "生成失败",
    dotClass: "bg-rose-400",
    pillClass:
      "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-300",
  };
}
