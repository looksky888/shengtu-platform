import { CheckCircle2, Coins, LoaderCircle, RefreshCw } from "lucide-react";

import { ProfileCreditBalanceSummary } from "@/app/profile/profile-credit-balance-summary";
import {
  ProfileCreditLedgerTable,
  type ProfileCreditLedgerTableProps,
} from "@/app/profile/profile-credit-ledger-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CreditLedgerEntry, ProfileCredits } from "@/lib/api";

type ProfileCreditsCardProps = ProfileCreditLedgerTableProps & {
  credits: ProfileCredits | null;
  creditsError: string;
  isLoadingCredits: boolean;
  isCheckingIn?: boolean;
  displayLatestCreditEntry: CreditLedgerEntry | null;
  onCheckin?: () => void;
  onRetry: () => void;
};

export function ProfileCreditsCard({
  credits,
  creditsError,
  isLoadingCredits,
  isCheckingIn = false,
  displayLatestCreditEntry,
  creditLedger,
  pagedCreditLedger,
  sortedCreditLedgerLength,
  safeCreditLedgerPage,
  creditLedgerPageCount,
  creditLedgerPageSize,
  onCheckin,
  onRetry,
  onPageChange,
}: ProfileCreditsCardProps) {
  const checkedIn = Boolean(credits?.checked_in_today);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
              <Coins className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                积分中心
              </CardTitle>
              <CardDescription className="truncate">
                余额、每日签到奖励与账户收支流水
              </CardDescription>
            </div>
          </div>
          {onCheckin ? (
            <Button
              type="button"
              size="sm"
              variant={checkedIn ? "outline" : "default"}
              disabled={isLoadingCredits || isCheckingIn || checkedIn}
              onClick={onCheckin}
            >
              {isCheckingIn ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : checkedIn ? (
                <CheckCircle2 className="size-3.5 text-status-success" />
              ) : (
                <Coins className="size-3.5" />
              )}
              {checkedIn ? "今日已签到" : "立即签到领积分"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoadingCredits ? (
          <LoadingCredits />
        ) : creditsError ? (
          <CreditsError message={creditsError} onRetry={onRetry} />
        ) : !credits ? (
          <EmptyState
            compact
            icon={Coins}
            title="暂无积分信息"
            description="稍后刷新即可同步账户积分数据。"
          />
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
    <div className="flex flex-col gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between dark:text-rose-300">
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
