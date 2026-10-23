import { CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import {
  failureAction,
  isProgressIndeterminate,
  modeLabel,
  resolveMessage,
  resolveProgress,
  resolveStage,
  statusLabel,
} from "@/app/task-queue/task-queue-utils";
import { CreationTaskProgressBar } from "@/components/creation-task-state";
import { cn } from "@/lib/utils";
import type { CreationTask } from "@/lib/api";

export function StatusPill({ status }: { status: CreationTask["status"] }) {
  const label = statusLabel(status);
  const cls =
    status === "running" || status === "queued"
      ? "border-foreground/20 bg-surface-muted text-foreground"
      : status === "success"
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : status === "error"
          ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-border bg-surface-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

export function TypePill({ mode }: { mode: CreationTask["mode"] }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/80 bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
      {modeLabel(mode)}
    </span>
  );
}

export function ProgressCell({ item }: { item: CreationTask }) {
  const progress = resolveProgress(item);
  const stage = resolveStage(item);
  const active = item.status === "running" || item.status === "queued";
  const bar =
    item.status === "success"
      ? "emerald"
      : item.status === "error" || item.status === "cancelled"
        ? "rose"
        : "obsidian";

  return (
    <div className="min-w-[160px] max-w-[220px] space-y-1">
      <div className="flex items-center gap-2">
        <CreationTaskProgressBar
          progress={progress}
          indeterminate={isProgressIndeterminate(item)}
          className={cn(
            "flex-1",
            bar === "emerald"
              ? "[&>div]:bg-emerald-500"
              : bar === "rose"
                ? "[&>div]:bg-rose-400"
                : "[&>div]:bg-foreground",
          )}
        />
        {item.status === "success" ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : null}
        {item.status === "error" ? <XCircle className="size-3.5 shrink-0 text-rose-400" /> : null}
      </div>
      <div
        className={cn(
          "truncate text-xs tabular-nums",
          active
            ? "font-medium text-foreground"
            : item.status === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : item.status === "error"
                ? "text-rose-500 dark:text-rose-400"
                : "text-muted-foreground",
        )}
      >
        {stage}
        {active ? ` ${isProgressIndeterminate(item) ? "处理中" : `${progress}%`}` : ""}
      </div>
    </div>
  );
}

export function MessageCell({ item }: { item: CreationTask }) {
  const msg = resolveMessage(item);
  const logs = item.log_count ?? item.events?.length ?? 0;
  const account = item.account_label || "—";
  const action = failureAction(item);
  return (
    <div className="min-w-[180px] max-w-[280px] space-y-0.5">
      <div
        className={cn(
          "line-clamp-1 text-sm",
          item.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-foreground",
        )}
        title={msg}
      >
        {msg}
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        日志 {logs} 条 · 账号 {account}
        {(item.account_switch_count || 0) > 0 ? ` · 换号 ${item.account_switch_count}` : ""}
      </div>
      {action?.href ? (
        <Link to={action.href} className="text-xs font-medium text-foreground underline-offset-4 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
