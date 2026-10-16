import {
  creditReasonLabel,
  formatCreditBalance,
  formatDateTime,
  formatSignedCreditDelta,
} from "@/app/profile/profile-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreditLedgerEntry } from "@/lib/api";

export type ProfileCreditLedgerTableProps = {
  creditLedger: CreditLedgerEntry[];
  pagedCreditLedger: CreditLedgerEntry[];
  sortedCreditLedgerLength: number;
  safeCreditLedgerPage: number;
  creditLedgerPageCount: number;
  creditLedgerPageSize: number;
  onPageChange: (updater: (current: number) => number) => void;
};

export function ProfileCreditLedgerTable({
  pagedCreditLedger,
  sortedCreditLedgerLength,
  safeCreditLedgerPage,
  creditLedgerPageCount,
  creditLedgerPageSize,
  onPageChange,
}: ProfileCreditLedgerTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
        <div className="text-sm font-semibold text-foreground">积分使用流水</div>
        <Badge variant="secondary" className="rounded-md">
          {sortedCreditLedgerLength} 条
        </Badge>
      </div>

      {sortedCreditLedgerLength > 0 ? (
        <>
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[28%] px-4 text-xs">类型</TableHead>
                  <TableHead className="w-[28%] px-4 text-xs">时间（中国时间）</TableHead>
                  <TableHead className="w-[22%] px-4 text-xs">积分变动</TableHead>
                  <TableHead className="w-[22%] px-4 text-xs">剩余积分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCreditLedger.map((entry) => (
                  <CreditLedgerRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground sm:px-5">
            <span>
              第 {safeCreditLedgerPage} / {creditLedgerPageCount} 页，显示{" "}
              {(safeCreditLedgerPage - 1) * creditLedgerPageSize + 1} -{" "}
              {Math.min(safeCreditLedgerPage * creditLedgerPageSize, sortedCreditLedgerLength)} /{" "}
              {sortedCreditLedgerLength} 条
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-3"
                onClick={() => onPageChange((current) => Math.max(1, current - 1))}
                disabled={safeCreditLedgerPage <= 1}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-3"
                onClick={() => onPageChange((current) => Math.min(creditLedgerPageCount, current + 1))}
                disabled={safeCreditLedgerPage >= creditLedgerPageCount}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">暂无积分流水记录。</div>
      )}
    </div>
  );
}

function CreditLedgerRow({ entry }: { entry: CreditLedgerEntry }) {
  return (
    <TableRow className="text-muted-foreground">
      <TableCell className="truncate px-4 py-3 text-sm font-medium text-foreground" title={creditReasonLabel(entry.reason)}>
        {creditReasonLabel(entry.reason)}
      </TableCell>
      <TableCell className="truncate px-4 py-3 text-sm tabular-nums" title={formatDateTime(entry.created_at)}>
        {formatDateTime(entry.created_at)}
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant={entry.delta >= 0 ? "success" : "warning"} className="rounded-md px-2 py-1 text-xs font-semibold">
          {formatSignedCreditDelta(entry.delta)}
        </Badge>
      </TableCell>
      <TableCell className="truncate px-4 py-3 text-sm font-semibold text-foreground" title={formatCreditBalance(entry.balance_after)}>
        {formatCreditBalance(entry.balance_after)}
      </TableCell>
    </TableRow>
  );
}
