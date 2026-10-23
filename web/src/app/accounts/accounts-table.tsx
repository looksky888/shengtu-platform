import { AccountTableRow } from "@/app/accounts/account-table-row";
import { AccountsBulkActions } from "@/app/accounts/accounts-bulk-actions";
import { AccountsFilteredEmptyState, AccountsInitialEmptyState } from "@/app/accounts/accounts-empty-states";
import { AccountsPagination } from "@/app/accounts/accounts-pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/api";

type AccountsTableProps = {
  accounts: Account[];
  currentRows: Account[];
  filteredCount: number;
  selectedIds: string[];
  selectedAccountIds: string[];
  abnormalAccountIds: string[];
  allCurrentSelected: boolean;
  showInitialEmptyState: boolean;
  showFilteredEmptyState: boolean;
  isHidden: boolean;
  isRefreshing: boolean;
  isDeleting: boolean;
  isUpdating: boolean;
  canRefreshAccounts: boolean;
  canDeleteAccounts: boolean;
  canUpdateAccount: boolean;
  canExportTokens: boolean;
  startIndex: number;
  pageSize: string;
  safePage: number;
  pageCount: number;
  paginationItems: (number | "...")[];
  onToggleSelectAll: (checked: boolean) => void;
  onSelectAccount: (account: Account, checked: boolean) => void;
  onRefreshSelected: () => void;
  onDeleteAbnormal: () => void;
  onDeleteSelected: () => void;
  onEdit: (account: Account) => void;
  onRefresh: (account: Account) => void;
  onDelete: (account: Account) => void;
  onPageSizeChange: (value: string) => void;
  onPageChange: (value: number | ((prev: number) => number)) => void;
};

export function AccountsTable(props: AccountsTableProps) {
  return (
    <Card className={cn("overflow-hidden rounded-xl border border-border/70 shadow-2xs", props.isHidden ? "hidden" : "")}>
      <CardContent className="space-y-0 p-0">
        <AccountsBulkActions
          selectedCount={props.selectedIds.length}
          selectedAccountIds={props.selectedAccountIds}
          abnormalAccountIds={props.abnormalAccountIds}
          isRefreshing={props.isRefreshing}
          isDeleting={props.isDeleting}
          canRefreshAccounts={props.canRefreshAccounts}
          canDeleteAccounts={props.canDeleteAccounts}
          onRefreshSelected={props.onRefreshSelected}
          onDeleteAbnormal={props.onDeleteAbnormal}
          onDeleteSelected={props.onDeleteSelected}
        />
        {props.showInitialEmptyState ? <AccountsInitialEmptyState /> : <AccountsTableBody {...props} />}
      </CardContent>
    </Card>
  );
}

function AccountsTableBody(props: AccountsTableProps) {
  return (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[920px]">
          <TableHeader className="bg-surface-subtle/80 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12"><Checkbox checked={props.allCurrentSelected} onCheckedChange={(checked) => props.onToggleSelectAll(Boolean(checked))} /></TableHead>
              <TableHead className="w-56">Token</TableHead>
              <TableHead className="w-28">类型</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-56">账号信息</TableHead>
              <TableHead className="w-24">额度</TableHead>
              <TableHead className="w-40">恢复时间</TableHead>
              <TableHead className="w-18">成功</TableHead>
              <TableHead className="w-18">失败</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.showFilteredEmptyState ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="p-0">
                  <AccountsFilteredEmptyState />
                </TableCell>
              </TableRow>
            ) : (
              props.currentRows.map((account) => (
                <AccountTableRow
                  key={account.id}
                  account={account}
                  selected={props.selectedIds.includes(account.id)}
                  canExportTokens={props.canExportTokens}
                  canUpdateAccount={props.canUpdateAccount}
                  canRefreshAccounts={props.canRefreshAccounts}
                  canDeleteAccounts={props.canDeleteAccounts}
                  isUpdating={props.isUpdating}
                  isRefreshing={props.isRefreshing}
                  isDeleting={props.isDeleting}
                  onSelectedChange={(checked) => props.onSelectAccount(account, checked)}
                  onEdit={props.onEdit}
                  onRefresh={props.onRefresh}
                  onDelete={props.onDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <AccountsPagination filteredCount={props.filteredCount} startIndex={props.startIndex} pageSize={props.pageSize} safePage={props.safePage} pageCount={props.pageCount} paginationItems={props.paginationItems} onPageSizeChange={props.onPageSizeChange} onPageChange={props.onPageChange} />
    </>
  );
}
