import { Card, CardContent } from "@/components/ui/card";

export function CreditSummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-5">
        <div className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}