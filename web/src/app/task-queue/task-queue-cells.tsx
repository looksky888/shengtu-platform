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
      ? "border-blue-200 bg-blue-50 text-blue-600"
      : status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
        : status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-600"
          : "border-stone-200 bg-stone-50 text-stone-500";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

export function TypePill({ mode }: { mode: CreationTask["mode"] }) {
  return (
    <span className="inline-flex items-center rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-stone-600">
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
      ? "bg-emerald-500"
      : item.status === "error" || item.status === "cancelled"
        ? "bg-rose-400"
        : "bg-blue-500";

  return (
    <div className="min-w-[160px] max-w-[220px] space-y-1">
      <div className="flex items-center gap-2">
        <CreationTaskProgressBar
          progress={progress}
          indeterminate={isProgressIndeterminate(item)}
          className={cn("flex-1", bar === "bg-emerald-500" ? "[&>div]:bg-emerald-500" : bar === "bg-rose-400" ? "[&>div]:bg-rose-400" : "[&>div]:bg-blue-500")}
        />
        {item.status === "success" ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : null}
        {item.status === "error" ? <XCircle className="size-3.5 shrink-0 text-rose-400" /> : null}
      </div>
      <div
        className={cn(
          "truncate text-xs",
          active ? "text-blue-600" : item.status === "success" ? "text-emerald-600" : item.status === "error" ? "text-rose-500" : "text-stone-500",
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
          item.status === "error" ? "text-rose-600" : "text-stone-700",
        )}
        title={msg}
      >
        {msg}
      </div>
      <div className="text-xs text-stone-400">
        日志 {logs} 条 · 账号 {account}
        {(item.account_switch_count || 0) > 0 ? ` · 换号 ${item.account_switch_count}` : ""}
      </div>
      {action?.href ? (
        <Link to={action.href} className="text-xs text-blue-500 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
