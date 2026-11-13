"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminStatTile({
  label,
  value,
  detail,
  hint,
  tone = "default",
  badge,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "info" | "danger";
  badge?: ReactNode;
  className?: string;
}) {
  const resolvedDetail = detail ?? hint;
  return (
    <div className={cn("admin-stat-tile", className)}>
      <div className="admin-stat-tile-label">
        <span className="truncate">{label}</span>
        {badge}
      </div>
      <div
        className={cn(
          "admin-stat-tile-value",
          tone === "success" && "text-[var(--admin-success)]",
          tone === "warning" && "text-[var(--admin-warning)]",
          tone === "info" && "text-[var(--admin-info)]",
          tone === "danger" && "text-[var(--admin-danger)]",
        )}
      >
        {value}
      </div>
      {resolvedDetail ? (
        <div className="admin-stat-tile-detail">{resolvedDetail}</div>
      ) : null}
    </div>
  );
}

export function AdminStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "error" | "danger" | "info";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "admin-status-badge",
        tone === "success" && "is-success",
        tone === "warning" && "is-warning",
        (tone === "error" || tone === "danger") && "is-error",
        tone === "info" && "is-info",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminStickyCommandBar({
  dirty,
  saving = false,
  disabled = false,
  statusText,
  dirtyText,
  dirtySummary,
  cleanText,
  cleanSummary,
  saveLabel = "保存更改",
  discardLabel = "放弃修改",
  onSave,
  onDiscard,
  onReset,
  extra,
  extraActions,
  className,
}: {
  dirty: boolean;
  saving?: boolean;
  disabled?: boolean;
  statusText?: ReactNode;
  dirtyText?: ReactNode;
  dirtySummary?: ReactNode;
  cleanText?: ReactNode;
  cleanSummary?: ReactNode;
  saveLabel?: string;
  discardLabel?: string;
  onSave?: () => void;
  onDiscard?: () => void;
  onReset?: () => void;
  extra?: ReactNode;
  extraActions?: ReactNode;
  className?: string;
}) {
  const resolvedDirtyText =
    dirtyText ??
    dirtySummary ??
    "存在未保存的参数更改，确认无误后点击右侧「保存更改」即时生效";
  const resolvedCleanText =
    cleanText ?? cleanSummary ?? "当前页面参数已与服务端配置保持同步";
  const resolvedDiscard = onDiscard ?? onReset;
  const resolvedExtra = extra ?? extraActions;

  return (
    <div
      className={cn(
        "admin-sticky-command-bar",
        dirty && "is-dirty",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs">
        {dirty ? (
          <AlertCircle className="size-3.5 shrink-0 text-[var(--admin-status-warning)]" />
        ) : (
          <CheckCircle2 className="size-3.5 shrink-0 text-[var(--admin-status-success)]" />
        )}
        <span
          className={cn(
            "truncate",
            dirty
              ? "font-semibold text-[var(--admin-text)]"
              : "text-[var(--admin-text-muted)]",
          )}
        >
          {statusText ?? (dirty ? resolvedDirtyText : resolvedCleanText)}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {resolvedExtra}
        {resolvedDiscard ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!dirty || saving || disabled}
            onClick={resolvedDiscard}
            className="h-7.5 gap-1.5 rounded-[6px] px-2.5 text-xs"
          >
            <RotateCcw className="size-3" />
            <span>{discardLabel}</span>
          </Button>
        ) : null}
        {onSave ? (
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving || disabled}
            onClick={onSave}
            className="h-7.5 gap-1.5 rounded-[6px] bg-[var(--admin-accent)] px-3 text-xs font-semibold text-[var(--admin-accent-fg)] hover:opacity-90"
          >
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>{saveLabel}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function AdminSectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[8px] border border-[var(--admin-border)] bg-[var(--admin-surface)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[var(--admin-text)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--admin-text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
