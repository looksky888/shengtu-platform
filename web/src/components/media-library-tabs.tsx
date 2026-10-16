import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function MediaLibraryTabs<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: Array<{ value: T; label: string; icon: LucideIcon }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex w-full min-w-0 flex-col gap-1 rounded-xl border border-border bg-muted/50 p-1 sm:flex-row">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition",
              active ? "bg-background text-foreground shadow-sm ring-1 ring-border/80" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
