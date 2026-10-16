import { Download, LoaderCircle, RefreshCw } from "lucide-react";

import { AccountImportDialog } from "@/app/accounts/components/account-import-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/api";

type AccountPageHeaderProps = {
  accounts: Account[];
  isLoading: boolean;
  isRefreshing: boolean;
  isDeleting: boolean;
  isExporting: boolean;
  canImportAccounts: boolean;
  canRefreshAccounts: boolean;
  canExportTokens: boolean;
  onLoad: () => void;
  onRefreshAll: () => void;
  onExportTokens: () => void;
  onImported: (items: Account[]) => void;
};

export function AccountPageHeader({ accounts, isLoading, isRefreshing, isDeleting, isExporting, canImportAccounts, canRefreshAccounts, canExportTokens, onLoad, onRefreshAll, onExportTokens, onImported }: AccountPageHeaderProps) {
  return (
    <PageHeader
      eyebrow="账号池"
      title="号池管理"
      actions={
        <>
          <Button variant="outline" className="h-10 rounded-lg" onClick={onLoad} disabled={isLoading || isRefreshing || isDeleting}>
            <RefreshCw className={cn("size-4", isLoading ? "animate-spin" : "")} />刷新
          </Button>
          {canRefreshAccounts ? (
            <Button variant="outline" className="h-10 rounded-lg" onClick={onRefreshAll} disabled={isLoading || isRefreshing || isDeleting || accounts.length === 0}>
              <RefreshCw className={cn("size-4", isRefreshing ? "animate-spin" : "")} />一键刷新所有账号信息和额度
            </Button>
          ) : null}
          {canImportAccounts ? <AccountImportDialog disabled={isLoading || isRefreshing || isDeleting} onImported={onImported} /> : null}
          {canExportTokens ? (
            <Button variant="outline" className="h-10 rounded-lg" onClick={onExportTokens} disabled={accounts.length === 0 || isExporting}>
              {isExporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}导出全部 Token
            </Button>
          ) : null}
        </>
      }
    />
  );
}