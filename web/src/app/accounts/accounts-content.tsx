import { useState } from "react";
import { AlertCircle, Bot, CheckCircle2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AccountEditDialog } from "@/app/accounts/account-edit-dialog";
import { AccountMetricCards } from "@/app/accounts/account-metric-cards";
import { AccountPageHeader } from "@/app/accounts/account-page-header";
import { AccountsLoadingCard } from "@/app/accounts/accounts-empty-states";
import { AccountsListFilters } from "@/app/accounts/accounts-list-filters";
import { AccountsTable } from "@/app/accounts/accounts-table";
import { GrokAccountsPanel } from "@/app/accounts/grok-accounts-panel";
import { GrokProviderTaskProgress } from "@/app/accounts/grok-provider-task-progress";
import { useAccountsManagement } from "@/app/accounts/use-accounts-management";
import { useGrokProviderCenter } from "@/app/accounts/use-grok-provider-center";
import { Button } from "@/components/ui/button";
import { SubNav } from "@/components/ui/sub-nav";
import { cn } from "@/lib/utils";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

type AccountPlatform = "gpt" | "grok";

const PLATFORM_ITEMS = [
  { value: "gpt" as const, label: "ChatGPT 号池", icon: Bot },
  { value: "grok" as const, label: "Grok 号池", icon: Sparkles },
] as const;

export function AccountsPageContent({ session }: { session: StoredAuthSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPlatform = searchParams.get("platform");
  const platform: AccountPlatform = rawPlatform === "grok" ? "grok" : "gpt";
  const [grokImportOpen, setGrokImportOpen] = useState(false);

  const handlePlatformChange = (next: AccountPlatform) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "gpt") {
      nextParams.delete("platform");
    } else {
      nextParams.set("platform", next);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const accounts = useAccountsManagement(session);
  const grok = useGrokProviderCenter(platform === "grok");
  const canWriteGrok = hasAPIPermission(session, "post", "/api/grok");
  const {
    canImportAccounts,
    canRefreshAccounts,
    canUpdateAccount,
    canDeleteAccounts,
    canExportTokens,
  } = accounts.permissions;

  const resetGptFilters = () => {
    accounts.setQuery("");
    accounts.setTypeFilter("all");
    accounts.setStatusFilter("all");
    accounts.setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <AccountPageHeader
        accounts={accounts.accounts}
        isLoading={accounts.isLoading}
        isRefreshing={accounts.isRefreshing}
        isDeleting={accounts.isDeleting}
        isExporting={accounts.isExporting}
        canImportAccounts={canImportAccounts}
        canRefreshAccounts={canRefreshAccounts}
        canExportTokens={canExportTokens}
        platform={platform}
        grokActions={
          <>
            {grok.task ? (
              <GrokProviderTaskProgress task={grok.task} defaultOpen={grok.taskAutoOpen} />
            ) : null}
            {grok.data ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 text-xs text-muted-foreground shadow-2xs">
                {grok.data.projection.status === "success" ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="size-3.5 text-rose-600 dark:text-rose-400" />
                )}
                投影{grok.data.projection.status === "success" ? "正常" : "异常"}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={grok.loading}
              onClick={() => void grok.load()}
            >
              <RefreshCw className={cn("size-3.5", grok.loading && "animate-spin")} />
              刷新
            </Button>
            {canWriteGrok ? (
              <Button
                type="button"
                size="sm"
                disabled={grok.busy}
                onClick={() => setGrokImportOpen(true)}
              >
                <Plus className="size-3.5" />
                账号接入
              </Button>
            ) : null}
          </>
        }
        onLoad={() => {
          void accounts.loadAccounts();
          void accounts.loadAccountsSummary();
        }}
        onRefreshAll={() => void accounts.handleRefreshAllAccounts()}
        onExportTokens={() => void accounts.handleExportTokens()}
        onImported={accounts.handleImported}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          ariaLabel="号池平台切换"
          items={PLATFORM_ITEMS}
          value={platform}
          onValueChange={handlePlatformChange}
          layoutId="accounts-platform-subnav"
        />
      </div>

      {platform === "grok" ? (
        <GrokAccountsPanel
          session={session}
          controller={grok}
          importOpen={grokImportOpen}
          onImportOpenChange={setGrokImportOpen}
        />
      ) : null}

      {platform === "gpt" ? (
        <>
          <AccountEditDialog
            account={accounts.editingAccount}
            editStatus={accounts.editStatus}
            editType={accounts.editType}
            editQuota={accounts.editQuota}
            editProxyUrl={accounts.editProxyUrl}
            editProxyTimezone={accounts.editProxyTimezone}
            clearProxy={accounts.clearProxy}
            isUpdating={accounts.isUpdating}
            canUpdateAccount={canUpdateAccount}
            onOpenChange={(open) => {
              if (!open) accounts.setEditingAccount(null);
            }}
            onStatusChange={accounts.setEditStatus}
            onTypeChange={accounts.setEditType}
            onQuotaChange={accounts.setEditQuota}
            onProxyUrlChange={accounts.setEditProxyUrl}
            onProxyTimezoneChange={accounts.setEditProxyTimezone}
            onClearProxyChange={accounts.setClearProxy}
            onSave={() => void accounts.handleUpdateAccount()}
          />

          <AccountMetricCards summary={accounts.summary} />

          <section className="flex flex-col gap-3">
            <AccountsListFilters
              total={accounts.filteredCount}
              query={accounts.query}
              typeFilter={accounts.typeFilter}
              statusFilter={accounts.statusFilter}
              onQueryChange={(value) => {
                accounts.setQuery(value);
                accounts.setPage(1);
              }}
              onTypeFilterChange={(value) => {
                accounts.setTypeFilter(value);
                accounts.setPage(1);
              }}
              onStatusFilterChange={(value) => {
                accounts.setStatusFilter(value);
                accounts.setPage(1);
              }}
              onResetFilters={resetGptFilters}
            />

            {accounts.isLoading && accounts.accounts.length === 0 ? (
              <AccountsLoadingCard />
            ) : null}

            <AccountsTable
              accounts={accounts.accounts}
              currentRows={accounts.currentRows}
              filteredCount={accounts.filteredCount}
              selectedIds={accounts.selectedIds}
              selectedAccountIds={accounts.selectedAccountIds}
              abnormalAccountIds={accounts.abnormalAccountIds}
              allCurrentSelected={accounts.allCurrentSelected}
              showInitialEmptyState={accounts.showInitialEmptyState}
              showFilteredEmptyState={accounts.showFilteredEmptyState}
              isHidden={accounts.isLoading && accounts.accounts.length === 0}
              isRefreshing={accounts.isRefreshing}
              isDeleting={accounts.isDeleting}
              isUpdating={accounts.isUpdating}
              canImportAccounts={canImportAccounts}
              canRefreshAccounts={canRefreshAccounts}
              canDeleteAccounts={canDeleteAccounts}
              canUpdateAccount={canUpdateAccount}
              canExportTokens={canExportTokens}
              startIndex={accounts.startIndex}
              pageSize={accounts.pageSize}
              safePage={accounts.safePage}
              pageCount={accounts.pageCount}
              paginationItems={accounts.paginationItems}
              onToggleSelectAll={accounts.toggleSelectAll}
              onSelectAccount={(account, checked) => {
                accounts.setSelectedIds((prev) =>
                  checked
                    ? Array.from(new Set([...prev, account.id]))
                    : prev.filter((item) => item !== account.id)
                );
              }}
              onRefreshSelected={() =>
                void accounts.handleRefreshAccounts(accounts.selectedAccountIds)
              }
              onDeleteAbnormal={() =>
                void accounts.handleDeleteAccounts(accounts.abnormalAccountIds)
              }
              onDeleteSelected={() =>
                void accounts.handleDeleteAccounts(accounts.selectedAccountIds)
              }
              onEdit={accounts.openEditDialog}
              onRefresh={(account) =>
                void accounts.handleRefreshAccounts([account.id])
              }
              onDelete={(account) =>
                void accounts.handleDeleteAccounts([account.id])
              }
              onPageSizeChange={accounts.setPageSize}
              onPageChange={accounts.setPage}
              onImported={accounts.handleImported}
              onResetFilters={resetGptFilters}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
