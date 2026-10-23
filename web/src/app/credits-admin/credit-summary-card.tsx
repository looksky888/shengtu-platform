export function CreditSummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
      <div className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{hint}</div>
    </div>
  );
}
