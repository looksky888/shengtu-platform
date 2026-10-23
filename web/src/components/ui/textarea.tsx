import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-[border-color,box-shadow,background-color] duration-150 selection:bg-primary selection:text-primary-foreground placeholder:text-subtle-foreground hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-foreground/35 focus-visible:ring-[3px] focus-visible:ring-foreground/[0.06] aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
