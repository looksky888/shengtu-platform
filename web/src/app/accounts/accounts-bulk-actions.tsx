import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type AccountsBulkActionsProps = {
  selectedCount: number;
  selectedAccountIds: string[];
  abnormalAccountIds: string[];
  isRefreshing: boolean;
  isDeleting: boolean;
  canRefreshAccounts: boolean;
  canDeleteAccounts: boolean;
  onRefreshSelected: () => void;
  onDeleteAbnormal: () => void;
  onDeleteSelected: () => void;
};

export function AccountsBulkActions({ selectedCount, selectedAccountIds, abnormalAccountIds, isRefreshing, isDeleting, canRefreshAccounts, canDeleteAccounts, onRefreshSelected, onDeleteAbnormal, onDeleteSelected }: AccountsBulkActionsProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {canRefreshAccounts ? (
          <Button variant="ghost" className="h-8 rounded-lg px-3 text-muted-foreground hover:bg-muted" onClick={onRefreshSelected} disabled={selectedAccountIds.length === 0 || isRefreshing}>
            {isRefreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}刷新选中账号信息和额度
          </Button>
        ) : null}
        {canDeleteAccounts ? (
          <>
            <Button variant="ghost" className="h-8 rounded-lg px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={onDeleteAbnormal} disabled={abnormalAccountIds.length === 0 || isDeleting}>
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}移除异常账号
            </Button>
            <Button variant="ghost" className="h-8 rounded-lg px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={onDeleteSelected} disabled={selectedAccountIds.length === 0 || isDeleting}>
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}删除所选
            </Button>
          </>
        ) : null}
        {selectedCount > 0 ? <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">已选择 {selectedCount} 项</span> : null}
      </div>
    </div>
  );
}
