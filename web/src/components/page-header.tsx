import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
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
        "flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4",
        className
      )}
    >
      <div className="flex max-w-3xl flex-col gap-1">
        {eyebrow ? (
          <div className="font-mid text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-xl leading-tight font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
