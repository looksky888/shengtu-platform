import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: string;
  badge?: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  badge,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 border-b border-border/75 pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4",
        className,
      )}
    >
      <div className="flex max-w-3xl flex-col gap-1">
        {eyebrow ? (
          <div className="inline-flex items-center gap-1.5 font-mid text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-foreground/45"
            />
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-lg leading-tight font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground sm:text-[13px] sm:leading-5">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
