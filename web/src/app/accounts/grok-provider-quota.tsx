import type { GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { providerQuotaSlots, type ProviderQuotaSlot } from "@/app/accounts/grok-provider-quota-model";
import { cn } from "@/lib/utils";

function quotaValue(slot: ProviderQuotaSlot) {
  if (slot.used == null || slot.limit == null) return "—";
  return `${slot.used}/${slot.limit}`;
}

function quotaDescription(slot: ProviderQuotaSlot) {
  const values = [`${slot.label}：已用 ${quotaValue(slot)}`];
  if (slot.remaining != null) values.push(`剩余 ${slot.remaining}`);
  if (slot.resetAt) values.push(`重置 ${slot.resetAt}`);
  return values.join("；");
}

function QuotaSlot({ slot }: { slot: ProviderQuotaSlot }) {
  const exhausted = slot.limit != null && slot.limit > 0 && slot.remaining === 0;
  return (
    <div className="min-w-0" title={quotaDescription(slot)} aria-label={quotaDescription(slot)}>
      <div className="flex items-center justify-between gap-1 text-[11px] leading-4">
        <span className="truncate text-muted-foreground">{slot.label}</span>
        <span className={cn("shrink-0 font-mono tabular-nums text-foreground", exhausted && "text-rose-600")}>
          {quotaValue(slot)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        {slot.usedPercent != null ? (
          <div
            className={cn("h-full rounded-full bg-[#1456f0]", exhausted && "bg-rose-500")}
            style={{ width: `${slot.usedPercent}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function GrokProviderQuota({ account }: { account: GrokProviderRow }) {
  const webTier = typeof account.metadata.tier === "string" ? account.metadata.tier : undefined;
  const slots = providerQuotaSlots(account.provider, account.quotas, { webTier });
  if (slots.length === 0) return <span className="text-xs text-muted-foreground">未同步</span>;
  return (
    <div
      className={cn(
        "grid w-full min-w-0 gap-x-3 gap-y-2",
        account.provider === "web" ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2 xl:grid-cols-3",
      )}
    >
      {slots.map((slot) => <QuotaSlot key={slot.capability} slot={slot} />)}
    </div>
  );
}
