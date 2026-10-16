import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "flex flex-col lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="flex max-w-3xl flex-col gap-1.5">
        <div className="font-mid text-[11px] font-medium tracking-[0.08em] text-[#8e8e93]">
          {eyebrow}
        </div>
        <h1 className="font-display text-[2rem] leading-[1.15] font-semibold text-foreground sm:text-[2.35rem]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}
