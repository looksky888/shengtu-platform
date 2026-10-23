import { metricCards, formatCompact, type AccountsSummary } from "@/app/accounts/account-utils";
import { cn } from "@/lib/utils";

const STATUS_DOT_MAP: Record<string, string> = {
  total: "bg-foreground/70",
  active: "bg-emerald-500",
  limited: "bg-amber-500",
  abnormal: "bg-rose-500",
  disabled: "bg-muted-foreground/60",
  quota: "bg-foreground/70",
};

export function AccountMetricCards({ summary }: { summary: AccountsSummary }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {metricCards.map((item) => {
        const Icon = item.icon;
        const value = summary[item.key];
        const dotClass = STATUS_DOT_MAP[item.key] ?? "bg-foreground/70";
        return (
          <div
            key={item.key}
            className="rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs transition-colors hover:border-border-strong/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden="true" />
                {item.label}
              </span>
              <span className={cn("inline-flex size-7 items-center justify-center rounded-lg", item.iconBadgeClassName)}>
                <Icon className="size-3.5" />
              </span>
            </div>
            <div className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {typeof value === "number" ? formatCompact(value) : value}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.subtitle}</div>
          </div>
        );
      })}
    </section>
  );
}