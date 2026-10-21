import { CheckCircle2, CircleAlert, Clock3, KeyRound, ShieldQuestion } from "lucide-react";

import {
  STATUS_LABELS,
  accountDetection,
  accountTypeLabel,
  credentialLabel,
  formatProviderDate,
  sourceLabel,
} from "@/app/accounts/grok-provider-account-model";
import type { GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function providerStatusTone(status: GrokProviderRow["status"]): string {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "disabled") return "border-border bg-muted text-muted-foreground";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function GrokProviderTypeBadge({ account }: { account: GrokProviderRow }) {
  return <span className="inline-flex rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{accountTypeLabel(account)}</span>;
}

export function GrokProviderStatusBadge({ account }: { account: GrokProviderRow }) {
  const detection = accountDetection(account);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/30", providerStatusTone(account.status))}>
          {account.status === "active" ? <CheckCircle2 className="size-3" /> : account.status === "error" ? <CircleAlert className="size-3" /> : <ShieldQuestion className="size-3" />}
          {STATUS_LABELS[account.status]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-xs">
        <div className="font-medium">{STATUS_LABELS[account.status]}</div>
        {detection ? (
          <div className="mt-2 grid gap-1 text-muted-foreground">
            <div>检测结果：{detection.outcome === "ok" ? "通过" : detection.outcome === "invalid" ? "凭据失效" : "检测失败"}</div>
            <div className="break-all">检测码：{detection.code || "—"}{detection.statusCode ? ` · HTTP ${detection.statusCode}` : ""}</div>
            <div>检测时间：{formatProviderDate(detection.checkedAt)}</div>
          </div>
        ) : <div className="mt-2 text-muted-foreground">尚无检测记录</div>}
      </PopoverContent>
    </Popover>
  );
}

export function GrokProviderCredential({ account }: { account: GrokProviderRow }) {
  return (
    <div className="grid gap-1 text-xs">
      <span className={cn("inline-flex items-center gap-1", account.has_credential ? "text-foreground" : "text-rose-600")}>
        <KeyRound className="size-3.5" />{credentialLabel(account)}
      </span>
      <span className="truncate text-muted-foreground" title={sourceLabel(account.source_type)}>{sourceLabel(account.source_type)}</span>
    </div>
  );
}

export function GrokProviderTime({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 text-xs"><span className="inline-flex items-center gap-1 text-muted-foreground"><Clock3 className="size-3.5" />{label}</span><span className="tabular-nums">{formatProviderDate(value)}</span></div>;
}
