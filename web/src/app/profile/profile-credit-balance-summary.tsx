import {
  formatCreditNumber,
  formatDateTime,
  formatSignedCreditDelta,
} from "@/app/profile/profile-utils";
import { Badge } from "@/components/ui/badge";
import type { CreditLedgerEntry, ProfileCredits } from "@/lib/api";
import { creditReasonLabel } from "@/lib/credit-labels";

export function ProfileCreditBalanceSummary({
  credits,
  latest,
}: {
  credits: ProfileCredits;
  latest: CreditLedgerEntry | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-border/70 bg-card p-4 sm:col-span-2 xl:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">当前可用余额</span>
          <Badge
            variant={credits.checked_in_today ? "success" : "secondary"}
            className="rounded-md"
          >
            {credits.checked_in_today ? "今日已签到" : "今日待签到"}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatCreditNumber(credits.balance)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            积分
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          实际结算以后端积分流水为准
        </div>
      </div>

      <MetaTile
        label="最近更新"
        value={formatDateTime(credits.account.updated_at)}
      />
      <MetaTile
        label="账户创建"
        value={formatDateTime(credits.account.created_at)}
      />

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="text-xs text-muted-foreground">最近一笔变动</div>
        {latest ? (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {creditReasonLabel(latest.reason)}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                {formatDateTime(latest.created_at)}
              </div>
            </div>
            <Badge
              variant={latest.delta >= 0 ? "success" : "warning"}
              className="shrink-0 rounded-md tabular-nums"
            >
              {formatSignedCreditDelta(latest.delta)}
            </Badge>
          </div>
        ) : (
          <div className="mt-1.5 text-sm text-muted-foreground">
            暂无变动记录
          </div>
        )}
      </div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1.5 truncate text-sm font-medium text-foreground tabular-nums"
        title={value}
      >
        {value || "—"}
      </div>
    </div>
  );
}
