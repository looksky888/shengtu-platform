import { Bot, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AccountEditDialog } from "@/app/accounts/account-edit-dialog";
import { AccountMetricCards } from "@/app/accounts/account-metric-cards";
import { AccountPageHeader } from "@/app/accounts/account-page-header";
import { AccountsLoadingCard } from "@/app/accounts/accounts-empty-states";
import { AccountsListFilters } from "@/app/accounts/accounts-list-filters";
import { AccountsTable } from "@/app/accounts/accounts-table";
import { GrokAccountsPanel } from "@/app/accounts/grok-accounts-panel";
import { useAccountsManagement } from "@/app/accounts/use-accounts-management";
import { SubNav } from "@/components/ui/sub-nav";
import type { StoredAuthSession } from "@/store/auth";

type AccountPlatform = "gpt" | "grok";

const PLATFORM_ITEMS = [
  { value: "gpt" as const, label: "ChatGPT 号池", icon: Bot },
  { value: "grok" as const, label: "Grok 号池", icon: Sparkles },
] as const;

export function AccountsPageContent({ session }: { session: StoredAuthSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPlatform = searchParams.get("platform");
  const platform: AccountPlatform = rawPlatform === "grok" ? "grok" : "gpt";

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
  const {
    canImportAccounts,
    canRefreshAccounts,
    canUpdateAccount,
    canDeleteAccounts,
    canExportTokens,
  } = accounts.permissions;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          ariaLabel="号池平台切换"
          items={PLATFORM_ITEMS}
          value={platform}
          onValueChange={handlePlatformChange}
          layoutId="accounts-platform-subnav"
        />
      </div>

      {platform === "grok" ? <GrokAccountsPanel session={session} /> : null}

      {platform === "gpt" ? (
        <>
          <AccountPageHeader
            accounts={accounts.accounts}
            isLoading={accounts.isLoading}
            isRefreshing={accounts.isRefreshing}
            isDeleting={accounts.isDeleting}
            isExporting={accounts.isExporting}
            canImportAccounts={canImportAccounts}
            canRefreshAccounts={canRefreshAccounts}
            canExportTokens={canExportTokens}
            onLoad={() => {
              void accounts.loadAccounts();
              void accounts.loadAccountsSummary();
            }}
            onRefreshAll={() => void accounts.handleRefreshAllAccounts()}
            onExportTokens={() => void accounts.handleExportTokens()}
            onImported={accounts.handleImported}
          />

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

          <section className="flex flex-col gap-4">
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
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
