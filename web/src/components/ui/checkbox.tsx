import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-border-strong data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground focus-visible:border-foreground/35 focus-visible:ring-[3px] focus-visible:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current transition-none">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" />
        ) : (
          <Check className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
