import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleStop, Clock3, Copy, LoaderCircle, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StateTone = "light" | "dark";

type CreationTaskProgressStateProps = {
  progress: number;
  indeterminate?: boolean;
  stage: string;
  message?: string;
  elapsedLabel?: string;
  taskId?: string;
  onCopyTaskId?: () => void;
  action?: ReactNode;
  tone?: StateTone;
  compact?: boolean;
  className?: string;
};

export function CreationTaskProgressState({
  progress,
  indeterminate = false,
  stage,
  message,
  elapsedLabel,
  taskId,
  onCopyTaskId,
  action,
  tone = "light",
  compact = false,
  className,
}: CreationTaskProgressStateProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const dark = tone === "dark";
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-5" : "gap-3 px-5 py-8", className)}>
      <div
        className={cn(
          "rounded-full border p-3 shadow-2xs",
          dark
            ? "border-zinc-800 bg-zinc-900/90 text-zinc-200"
            : "border-border/80 bg-surface text-foreground/75",
        )}
      >
        {indeterminate || safeProgress > 0 ? <LoaderCircle className="size-5 animate-spin" /> : <Clock3 className="size-5" />}
      </div>
      <p className={cn("text-sm font-medium", dark ? "text-zinc-100" : "text-foreground/85")}>{stage}</p>
      <div className={cn("w-full max-w-[220px] overflow-hidden rounded-full", dark ? "bg-zinc-800/90" : "bg-foreground/10")}>
        <div
          className={cn(
            "h-1.5 rounded-full transition-[width] duration-500",
            dark ? "bg-zinc-100" : "bg-foreground",
            indeterminate && "w-2/5 animate-indeterminate",
          )}
          style={indeterminate ? undefined : { width: `${safeProgress}%` }}
        />
      </div>
      <span className={cn("font-mono text-xs tabular-nums", dark ? "text-zinc-400" : "text-muted-foreground")}>
        {indeterminate ? "处理中" : `${safeProgress}%`}{elapsedLabel ? ` · 已等待 ${elapsedLabel}` : ""}
      </span>
      {message ? <p className={cn("max-w-sm text-xs leading-5", dark ? "text-zinc-500" : "text-muted-foreground")}>{message}</p> : null}
      {taskId && onCopyTaskId ? (
        <button
          type="button"
          className={cn("flex max-w-[270px] items-center gap-1.5 truncate font-mono text-[10px] transition-colors", dark ? "text-zinc-500 hover:text-zinc-300" : "text-muted-foreground hover:text-foreground")}
          onClick={onCopyTaskId}
          title={taskId}
        >
          <Copy className="size-3" />
          {taskId}
        </button>
      ) : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function CreationTaskProgressBar({
  progress,
  indeterminate = false,
  tone = "light",
  className,
}: {
  progress: number;
  indeterminate?: boolean;
  tone?: StateTone;
  className?: string;
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className={cn("h-1.5 min-w-0 overflow-hidden rounded-full", tone === "dark" ? "bg-zinc-800/90" : "bg-foreground/10", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tone === "dark" ? "bg-zinc-100" : "bg-foreground", indeterminate && "w-2/5 animate-indeterminate")}
        style={indeterminate ? undefined : { width: `${safeProgress}%` }}
      />
    </div>
  );
}

type CreationTaskMessageStateProps = {
  icon?: ReactNode;
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  actionDisabled?: boolean;
  tone?: StateTone;
  className?: string;
};

export function CreationTaskMessageState({
  icon = <AlertCircle />,
  title,
  detail,
  actionLabel,
  actionHref,
  onAction,
  actionIcon,
  actionDisabled,
  tone = "light",
  className,
}: CreationTaskMessageStateProps) {
  const dark = tone === "dark";
  const action = actionLabel && actionHref ? (
    <Button asChild type="button" variant="outline" className={messageActionClass(dark)}>
      <Link to={actionHref}>{actionLabel}</Link>
    </Button>
  ) : actionLabel && onAction ? (
    <Button type="button" variant="outline" className={messageActionClass(dark)} disabled={actionDisabled} onClick={onAction}>
      {actionDisabled ? <LoaderCircle className="animate-spin" /> : actionIcon || <RotateCcw />}
      {actionLabel}
    </Button>
  ) : null;

  return (
    <div className={cn("flex flex-col items-center px-7 text-center", dark ? "text-zinc-100" : "text-foreground", className)}>
      <div className={cn("flex size-14 items-center justify-center rounded-full border", dark ? "border-zinc-800 bg-zinc-900/90 text-zinc-300" : "border-border/80 bg-surface-muted text-muted-foreground")}>
        {icon}
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className={cn("mt-2 max-w-sm text-xs leading-5", dark ? "text-zinc-400" : "text-muted-foreground")}>{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function CreationTaskSuccessIcon({ className }: { className?: string }) {
  return <CheckCircle2 className={cn("size-6 text-emerald-500", className)} />;
}

export function CreationTaskCancelButton({
  onCancel,
  disabled = false,
  loading = false,
  tone = "light",
  iconOnly = false,
  label = "取消任务",
  className,
}: {
  onCancel: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: StateTone;
  iconOnly?: boolean;
  label?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <Button
      type="button"
      variant={dark ? "ghost" : "outline"}
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "rounded-full",
        dark
          ? "border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          : "border-amber-500/25 bg-amber-500/10 text-amber-700 shadow-none hover:bg-amber-500/15 dark:text-amber-300",
        className,
      )}
      disabled={disabled || loading}
      onClick={onCancel}
      aria-label={label}
      title={label}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : <CircleStop />}
      {iconOnly ? null : label}
    </Button>
  );
}

function messageActionClass(dark: boolean) {
  return dark
    ? "rounded-full border-zinc-700/80 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
    : "rounded-full border-border bg-surface text-foreground hover:bg-surface-hover";
}
