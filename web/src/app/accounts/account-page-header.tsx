import type { ReactNode } from "react";
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
  platform: "gpt" | "grok";
  grokActions?: ReactNode;
  onLoad: () => void;
  onRefreshAll: () => void;
  onExportTokens: () => void;
  onImported: (items: Account[]) => void;
};

export function AccountPageHeader({
  accounts,
  isLoading,
  isRefreshing,
  isDeleting,
  isExporting,
  canImportAccounts,
  canRefreshAccounts,
  canExportTokens,
  platform,
  grokActions,
  onLoad,
  onRefreshAll,
  onExportTokens,
  onImported,
}: AccountPageHeaderProps) {
  return (
    <PageHeader
      eyebrow="号池与运维"
      title="号池管理"
      actions={
        platform === "grok" ? (
          grokActions
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onLoad} disabled={isLoading || isRefreshing || isDeleting}>
              <RefreshCw className={cn("size-3.5", isLoading ? "animate-spin" : "")} />
              刷新
            </Button>
            {canRefreshAccounts ? (
              <Button variant="outline" size="sm" onClick={onRefreshAll} disabled={isLoading || isRefreshing || isDeleting || accounts.length === 0}>
                <RefreshCw className={cn("size-3.5", isRefreshing ? "animate-spin" : "")} />
                全量刷新额度
              </Button>
            ) : null}
            {canExportTokens ? (
              <Button variant="outline" size="sm" onClick={onExportTokens} disabled={accounts.length === 0 || isExporting}>
                {isExporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                导出 Token
              </Button>
            ) : null}
            {canImportAccounts ? <AccountImportDialog disabled={isLoading || isRefreshing || isDeleting} onImported={onImported} /> : null}
          </>
        )
      }
    />
  );
}