import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-status-info-soft text-status-info",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-background text-foreground",
        success: "border-status-success/30 bg-status-success-soft text-status-success",
        warning: "border-status-warning/30 bg-status-warning-soft text-status-warning",
        danger: "border-status-danger/30 bg-status-danger-soft text-status-danger",
        info: "border-status-info/30 bg-status-info-soft text-status-info",
        violet: "border-status-info/30 bg-status-info-soft text-status-info",
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
