import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight transition-colors",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-surface-muted text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-surface text-foreground",
        success: "border-status-success/25 bg-status-success-soft text-status-success",
        warning: "border-status-warning/25 bg-status-warning-soft text-status-warning",
        danger: "border-status-danger/25 bg-status-danger-soft text-status-danger",
        info: "border-border/80 bg-surface-muted text-muted-foreground",
        violet: "border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
