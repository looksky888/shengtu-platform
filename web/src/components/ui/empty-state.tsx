import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center text-center",
        compact
          ? "gap-2.5 px-4 py-8"
          : "studio-canvas-dots overflow-hidden rounded-2xl border border-dashed border-border-strong/65 bg-surface/75 gap-3.5 px-6 py-14",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "relative flex items-center justify-center rounded-2xl border border-border bg-surface text-foreground/75 shadow-[0_2px_8px_rgba(0,0,0,0.05)] ring-4 ring-surface-muted/80 dark:shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
            compact ? "size-10 rounded-xl" : "size-12",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5 stroke-[1.75]"} />
        </div>
      ) : null}
      <div className="relative max-w-sm space-y-1">
        <p className={cn("font-semibold tracking-tight text-foreground", compact ? "text-xs" : "text-sm")}>
          {title}
        </p>
        {description ? (
          <p className={cn("leading-relaxed text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="relative flex flex-wrap items-center justify-center gap-2 pt-1.5">{action}</div> : null}
    </div>
  );
}
