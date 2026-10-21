import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type AccountImportMethodCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
};

export function AccountImportMethodCard({ title, description, icon: Icon, onClick }: AccountImportMethodCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-card p-0 text-left transition hover:border-border/90 hover:bg-muted/40"
    >
      <Card className="rounded-xl border-0 bg-transparent shadow-none">
        <CardContent className="flex items-start gap-4 p-4">
          <div className="rounded-lg bg-muted p-2.5 text-foreground">
            <Icon className="size-5" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-sm leading-6 text-muted-foreground">{description}</div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}