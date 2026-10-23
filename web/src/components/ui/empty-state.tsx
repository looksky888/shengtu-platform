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
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2.5 px-4 py-8" : "gap-3.5 px-6 py-14",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-xl border border-border/80 bg-surface-muted/70 text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
            compact ? "size-9" : "size-11",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} />
        </div>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className={cn("font-semibold tracking-tight text-foreground", compact ? "text-xs" : "text-sm")}>
          {title}
        </p>
        {description ? (
          <p className={cn("leading-relaxed text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
