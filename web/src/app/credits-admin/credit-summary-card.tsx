import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function CreditSummaryCard({
  label,
  value,
  hint,
  badge,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  badge?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-colors hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
          {label}
        </span>
        {badge ? (
          <Badge variant="secondary" className="rounded px-1.5 py-0 font-mono text-[10px] tabular-nums">
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="font-data text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
