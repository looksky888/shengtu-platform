import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  size?: "sm" | "default" | "lg";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "default",
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/75 bg-surface-muted/35 text-center",
        size === "sm" && "px-4 py-6",
        size === "default" && "px-6 py-10",
        size === "lg" && "px-8 py-14",
        className
      )}
      {...props}
    >
      {Icon ? (
        <div
          className={cn(
            "mb-3 flex items-center justify-center rounded-2xl border border-border/70 bg-surface text-muted-foreground shadow-xs",
            size === "sm" ? "size-9 rounded-xl" : "size-11"
          )}
        >
          <Icon className={size === "sm" ? "size-4" : "size-5"} />
        </div>
      ) : null}
      <h3
        className={cn(
          "font-semibold tracking-tight text-foreground",
          size === "sm" ? "text-xs" : "text-sm"
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            "mt-1 max-w-md text-muted-foreground",
            size === "sm" ? "text-[11px] leading-4" : "text-xs leading-5"
          )}
        >
          {description}
        </p>
      ) : null}
      {children}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
