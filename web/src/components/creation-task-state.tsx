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
      <div className={cn("rounded-full p-3 shadow-sm", dark ? "bg-white/[0.08] text-indigo-200" : "bg-white text-stone-500")}>
        {indeterminate || safeProgress > 0 ? <LoaderCircle className="size-5 animate-spin" /> : <Clock3 className="size-5" />}
      </div>
      <p className={cn("text-sm", dark ? "text-white/85" : "text-stone-600")}>{stage}</p>
      <div className={cn("w-full max-w-[220px] overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-stone-200")}>
        <div
          className={cn(
            "h-1.5 rounded-full transition-[width] duration-500",
            dark ? "bg-indigo-300" : "bg-blue-500",
            indeterminate && "w-2/5 animate-pulse",
          )}
          style={indeterminate ? undefined : { width: `${safeProgress}%` }}
        />
      </div>
      <span className={cn("font-mono text-xs tabular-nums", dark ? "text-white/55" : "text-stone-400")}>
        {indeterminate ? "处理中" : `${safeProgress}%`}{elapsedLabel ? ` · 已等待 ${elapsedLabel}` : ""}
      </span>
      {message ? <p className={cn("max-w-sm text-xs leading-5", dark ? "text-white/40" : "text-stone-400")}>{message}</p> : null}
      {taskId && onCopyTaskId ? (
        <button
          type="button"
          className={cn("flex max-w-[270px] items-center gap-1.5 truncate font-mono text-[10px] transition-colors", dark ? "text-white/30 hover:text-white/60" : "text-stone-400 hover:text-stone-600")}
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
    <div className={cn("h-1.5 min-w-0 overflow-hidden rounded-full", tone === "dark" ? "bg-white/10" : "bg-stone-100", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tone === "dark" ? "bg-indigo-300" : "bg-blue-500", indeterminate && "w-2/5 animate-pulse")}
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
    <div className={cn("flex flex-col items-center px-7 text-center", dark ? "text-white" : "text-stone-700", className)}>
      <div className={cn("flex size-14 items-center justify-center rounded-full border", dark ? "border-white/10 bg-white/[0.05] text-white/65" : "border-stone-200 bg-stone-50 text-stone-500")}>
        {icon}
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className={cn("mt-2 max-w-sm text-xs leading-5", dark ? "text-white/40" : "text-stone-500")}>{detail}</p>
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
        dark ? "text-white/55 hover:bg-white/10 hover:text-white" : "border-amber-200 bg-amber-50 text-amber-700 shadow-none hover:bg-amber-100",
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
    ? "rounded-full border-white/15 bg-white/[0.06] text-white hover:bg-white/10"
    : "rounded-full border-stone-200 bg-white text-stone-600 hover:bg-stone-50";
}
