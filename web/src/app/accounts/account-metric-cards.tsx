import { metricCards, formatCompact, type AccountsSummary } from "@/app/accounts/account-utils";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AccountMetricCards({ summary }: { summary: AccountsSummary }) {
  return (
    <section className="mt-5 flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((item) => {
          const Icon = item.icon;
          const value = summary[item.key];
          return (
            <Card key={item.key} className={cn("overflow-hidden rounded-[20px] shadow-[0_0_15px_rgba(44,30,116,0.16)]", item.className)}>
              <CardContent className="p-4">
                <div className="mb-4 flex items-start justify-between">
                  <span className="text-xs font-medium text-white/78">{item.label}</span>
                  <Icon className="size-4 text-white/72" />
                </div>
                <div className="font-display text-[1.75rem] font-semibold tracking-normal text-white">
                  <span className={typeof value === "number" ? "" : "text-[1.1rem]"}>{typeof value === "number" ? formatCompact(value) : value}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}