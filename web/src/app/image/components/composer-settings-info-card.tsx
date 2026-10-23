import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ComposerSettingsInfoCardProps = {
  title: string;
  value: ReactNode;
  detail: ReactNode;
  variant?: "default" | "credit";
};

export function ComposerSettingsInfoCard({
  title,
  value,
  detail,
  variant = "default",
}: ComposerSettingsInfoCardProps) {
  const isCredit = variant === "credit";
  return (
    <div
      className={cn(
        "col-span-2 rounded-xl border px-3 py-2 sm:col-span-3",
        isCredit
          ? "border-border/85 bg-surface-muted/80"
          : "border-border/70 bg-surface-muted/45",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {title}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-right text-sm font-semibold text-foreground tabular-nums",
            !isCredit && "font-mono",
          )}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
