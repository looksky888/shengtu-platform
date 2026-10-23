import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 outline-none motion-safe:active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-foreground/10 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-primary/90 dark:shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
        brand:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-primary/90 dark:shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25",
        "destructive-outline":
          "border border-status-danger/25 bg-status-danger-soft/60 text-status-danger hover:bg-status-danger-soft",
        outline:
          "border border-border bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.025)] hover:border-border-strong hover:bg-surface-hover hover:text-foreground dark:border-border dark:bg-surface/80 dark:hover:bg-surface-hover",
        secondary:
          "bg-surface-muted text-secondary-foreground shadow-none hover:bg-surface-hover active:bg-surface-active",
        ghost:
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-9 px-3.5 py-2 has-[>svg]:px-3",
        lg: "h-10 rounded-lg px-5 has-[>svg]:px-4",
        xl: "h-11 rounded-xl px-6 text-base has-[>svg]:px-5",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
