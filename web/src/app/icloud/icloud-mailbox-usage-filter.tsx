import { cn } from "@/lib/utils";
import type { ICloudMailboxUsage } from "@/lib/icloud-api";

const options: Array<{ value: ICloudMailboxUsage; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unused", label: "未使用" },
  { value: "used", label: "已使用" },
];

export function ICloudMailboxUsageFilter({
  value,
  disabled,
  onChange,
}: {
  value: ICloudMailboxUsage;
  disabled?: boolean;
  onChange: (value: ICloudMailboxUsage) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">使用状态</span>
      <div role="tablist" aria-label="邮箱使用状态" className="inline-flex h-9 items-center rounded-lg border border-border bg-surface-muted/70 p-1">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              className={cn(
                "h-7 rounded-md px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-border/70"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
