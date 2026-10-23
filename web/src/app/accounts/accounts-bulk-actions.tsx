import { CheckSquare, LoaderCircle, RefreshCw, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AccountsBulkActionsProps = {
  currentPageCount: number;
  allCurrentSelected: boolean;
  selectedCount: number;
  selectedAccountIds: string[];
  abnormalAccountIds: string[];
  isRefreshing: boolean;
  isDeleting: boolean;
  canRefreshAccounts: boolean;
  canDeleteAccounts: boolean;
  onToggleSelectAll: (checked: boolean) => void;
  onRefreshSelected: () => void;
  onDeleteAbnormal: () => void;
  onDeleteSelected: () => void;
};

export function AccountsBulkActions({
  currentPageCount,
  allCurrentSelected,
  selectedCount,
  selectedAccountIds,
  abnormalAccountIds,
  isRefreshing,
  isDeleting,
  canRefreshAccounts,
  canDeleteAccounts,
  onToggleSelectAll,
  onRefreshSelected,
  onDeleteAbnormal,
  onDeleteSelected,
}: AccountsBulkActionsProps) {
  if (!canRefreshAccounts && !canDeleteAccounts) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-2.5 transition-colors",
        selectedCount > 0 ? "bg-surface-muted/70" : "bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onToggleSelectAll(!allCurrentSelected)}
          disabled={currentPageCount === 0}
        >
          {allCurrentSelected ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
          {allCurrentSelected ? "取消本页全选" : `全选本页 (${currentPageCount})`}
        </Button>
        {selectedCount > 0 ? (
          <span className="inline-flex items-center rounded-md bg-foreground px-2 py-0.5 text-[11px] font-medium text-background tabular-nums">
            已选择 {selectedCount} 项
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {canRefreshAccounts ? (
          <Button
            type="button"
            variant={selectedAccountIds.length > 0 ? "outline" : "ghost"}
            size="xs"
            onClick={onRefreshSelected}
            disabled={selectedAccountIds.length === 0 || isRefreshing}
          >
            {isRefreshing ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            批量测活与刷新额度
          </Button>
        ) : null}
        {canDeleteAccounts ? (
          <>
            {abnormalAccountIds.length > 0 ? (
              <Button
                type="button"
                variant="destructive-outline"
                size="xs"
                onClick={onDeleteAbnormal}
                disabled={isDeleting}
              >
                {isDeleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                清理异常 ({abnormalAccountIds.length})
              </Button>
            ) : null}
            <Button
              type="button"
              variant={selectedAccountIds.length > 0 ? "destructive-outline" : "ghost"}
              size="xs"
              className={selectedAccountIds.length === 0 ? "text-muted-foreground" : undefined}
              onClick={onDeleteSelected}
              disabled={selectedAccountIds.length === 0 || isDeleting}
            >
              {isDeleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              批量删除
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
