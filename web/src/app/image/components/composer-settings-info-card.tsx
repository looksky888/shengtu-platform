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
        "col-span-2 rounded-2xl border px-3 py-2 sm:col-span-3",
        isCredit
          ? "border-[#dbeafe] bg-[#eef4ff] dark:border-sky-900/70 dark:bg-sky-950/20"
          : "border-[#e5e7eb] bg-[#f8fafc] dark:border-border dark:bg-background/50",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium text-[#45515e]",
            isCredit ? "dark:text-sky-200/80" : "dark:text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-right text-sm font-semibold",
            isCredit ? "text-[#1456f0] dark:text-sky-300" : "font-mono text-[#18181b] dark:text-foreground",
          )}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-[#8e8e93] dark:text-muted-foreground">{detail}</p>
    </div>
  );
}
