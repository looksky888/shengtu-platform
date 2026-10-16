import type { ReactNode } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type PaymentSectionStateProps = {
  mode: "loading" | "error" | "empty";
  title: string;
  detail?: string;
  onRetry?: () => void;
  action?: ReactNode;
};

export function PaymentSectionState({ mode, title, detail, onRetry, action }: PaymentSectionStateProps) {
  if (mode === "loading") {
    return (
      <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
        <LoaderCircle className="size-5 animate-spin" />
        {title}
      </div>
    );
  }
  if (mode === "error") {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 text-center" role="alert">
        <AlertCircle className="size-6 text-status-danger" />
        <div>
          <p className="text-sm font-medium text-status-danger">{title}</p>
          {detail ? <p className="mt-1 max-w-lg text-xs text-status-danger/80">{detail}</p> : null}
        </div>
        {onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}><RefreshCw className="size-3.5" />重新加载</Button> : null}
      </div>
    );
  }
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {detail ? <p className="max-w-lg text-xs text-muted-foreground">{detail}</p> : null}
      {action}
    </div>
  );
}
