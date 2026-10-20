import { Coins, LoaderCircle, RefreshCw } from "lucide-react";

import { ProfileCreditBalanceSummary } from "@/app/profile/profile-credit-balance-summary";
import {
  ProfileCreditLedgerTable,
  type ProfileCreditLedgerTableProps,
} from "@/app/profile/profile-credit-ledger-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CreditLedgerEntry, ProfileCredits } from "@/lib/api";

type ProfileCreditsCardProps = ProfileCreditLedgerTableProps & {
  credits: ProfileCredits | null;
  creditsError: string;
  isLoadingCredits: boolean;
  displayLatestCreditEntry: CreditLedgerEntry | null;
  onRetry: () => void;
};

export function ProfileCreditsCard({
  credits,
  creditsError,
  isLoadingCredits,
  displayLatestCreditEntry,
  creditLedger,
  pagedCreditLedger,
  sortedCreditLedgerLength,
  safeCreditLedgerPage,
  creditLedgerPageCount,
  creditLedgerPageSize,
  onRetry,
  onPageChange,
}: ProfileCreditsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-brand">
              <Coins className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                积分中心
              </CardTitle>
              <CardDescription className="truncate">
                余额、签到状态与使用流水
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={credits?.checked_in_today ? "success" : "secondary"}
            className="w-fit rounded-md"
          >
            {credits?.checked_in_today ? "今日已签到" : "今日未签到"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoadingCredits ? (
          <LoadingCredits />
        ) : creditsError ? (
          <CreditsError message={creditsError} onRetry={onRetry} />
        ) : !credits ? (
          <div className="rounded-xl border border-border bg-surface-muted/35 px-3 py-4 text-sm text-muted-foreground">
            暂无积分信息。
          </div>
        ) : (
          <>
            <ProfileCreditBalanceSummary
              credits={credits}
              latest={displayLatestCreditEntry}
            />
            <ProfileCreditLedgerTable
              creditLedger={creditLedger}
              pagedCreditLedger={pagedCreditLedger}
              sortedCreditLedgerLength={sortedCreditLedgerLength}
              safeCreditLedgerPage={safeCreditLedgerPage}
              creditLedgerPageCount={creditLedgerPageCount}
              creditLedgerPageSize={creditLedgerPageSize}
              onPageChange={onPageChange}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingCredits() {
  return (
    <div className="flex min-h-[160px] items-center justify-center">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function CreditsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900/70 dark:bg-rose-950/20 dark:text-rose-300">
      <span>积分信息加载失败：{message}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onRetry}
      >
        <RefreshCw className="size-4" />
        重试
      </Button>
    </div>
  );
}
