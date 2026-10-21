import { metricCards, formatCompact, type AccountsSummary } from "@/app/accounts/account-utils";
import { cn } from "@/lib/utils";

export function AccountMetricCards({ summary }: { summary: AccountsSummary }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((item) => {
          const Icon = item.icon;
          const value = summary[item.key];
          return (
            <div key={item.key} className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                <span className={cn("rounded-lg p-2", item.iconBadgeClassName)}>
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {typeof value === "number" ? formatCompact(value) : value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{item.subtitle}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}