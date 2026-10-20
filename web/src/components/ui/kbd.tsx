import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded-md border border-border/80 bg-surface-muted px-1.5 font-mono text-[11px] font-medium leading-none text-muted-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.06)]",
        className
      )}
      {...props}
    />
  );
}
