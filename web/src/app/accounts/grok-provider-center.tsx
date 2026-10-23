import { useState } from "react";

import { GrokProviderConfigDialog, type GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import { GrokProviderDeleteDialog } from "@/app/accounts/grok-provider-delete-dialog";
import { GrokProviderImportDialog } from "@/app/accounts/grok-provider-import-dialog";
import { GrokProviderSummary } from "@/app/accounts/grok-provider-summary";
import { GrokProviderTable } from "@/app/accounts/grok-provider-table";
import {
  GrokProviderDiagnosticCallout,
  GrokProviderTableEmpty,
  GrokProviderTableError,
  GrokProviderTableSkeleton,
} from "@/app/accounts/grok-provider-table-state";
import { GrokProviderToolbar } from "@/app/accounts/grok-provider-toolbar";
import type { GrokProviderCenterController, GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export function GrokProviderCenter({
  session,
  controller,
  importOpen,
  onImportOpenChange,
}: {
  session: StoredAuthSession;
  controller: GrokProviderCenterController;
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
}) {
  const [configKind, setConfigKind] = useState<GrokConfigDialogKind>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionAccount, setActionAccount] = useState<GrokProviderRow | null>(null);
  const canWrite = hasAPIPermission(session, "post", "/api/grok");
  const canDelete = hasAPIPermission(session, "delete", "/api/grok");
  const summary = controller.data?.summary;
  const dialogAccounts = actionAccount ? [actionAccount] : controller.selectedAccounts;
  const dialogProvider = actionAccount?.provider || controller.selectedProvider;
  const filtered = controller.provider !== "all" || controller.status !== "all" || Boolean(controller.keyword.trim());
  const openConfig = (kind: GrokConfigDialogKind, account?: GrokProviderRow) => {
    setActionAccount(account || null);
    setConfigKind(kind);
  };
  const openDelete = (account?: GrokProviderRow) => {
    setActionAccount(account || null);
    setDeleteOpen(true);
  };

  // Deduplicate error display: when initial load fails (!data && error), GrokProviderTableError renders the single diagnostic callout.
  const showActionCallout = Boolean(controller.actionError) && !(controller.error && !controller.data);

  return (
    <div className="flex flex-col gap-4">
      <GrokProviderSummary summary={summary} />

      <section className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
        <GrokProviderToolbar
          controller={controller}
          canWrite={canWrite}
          canDelete={canDelete}
          isAdmin={session.role === "admin"}
          onConfigure={(kind) => openConfig(kind)}
          onDelete={() => openDelete()}
        />

        {showActionCallout ? (
          <GrokProviderDiagnosticCallout
            message={controller.actionError}
            loading={controller.loading}
            onRetry={() => void controller.load()}
            onDismiss={controller.clearActionError}
          />
        ) : null}

        {controller.error && !controller.data ? (
          <GrokProviderTableError
            message={controller.error}
            loading={controller.loading}
            onRetry={() => void controller.load()}
          />
        ) : controller.loading && !controller.data ? (
          <GrokProviderTableSkeleton />
        ) : controller.data?.items.length === 0 ? (
          <GrokProviderTableEmpty
            filtered={filtered}
            canWrite={canWrite}
            onImport={() => onImportOpenChange(true)}
            onResetFilters={() => {
              controller.setProvider("all");
              controller.setStatus("all");
              controller.setKeyword("");
            }}
          />
        ) : (
          <GrokProviderTable
            controller={controller}
            canWrite={canWrite}
            canDelete={canDelete}
            isAdmin={session.role === "admin"}
            onConfigure={openConfig}
            onDelete={openDelete}
          />
        )}
      </section>

      <GrokProviderImportDialog
        open={importOpen}
        busy={controller.busy}
        onOpenChange={onImportOpenChange}
        onSubmit={controller.importAccounts}
      />
      <GrokProviderConfigDialog
        kind={configKind}
        count={dialogAccounts.length}
        busy={controller.busy}
        onOpenChange={(open) => {
          if (!open) {
            setConfigKind(null);
            setActionAccount(null);
          }
        }}
        onConcurrency={(value) =>
          controller.setConcurrency(value, actionAccount ? controller.accountScope(actionAccount) : undefined)
        }
        onEgress={(mode, proxyUrl) =>
          controller.setEgress(mode, proxyUrl, actionAccount ? controller.accountScope(actionAccount) : undefined)
        }
      />
      <GrokProviderDeleteDialog
        open={deleteOpen}
        provider={dialogProvider}
        accountIds={dialogAccounts.map((item) => item.id)}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setActionAccount(null);
        }}
        onDeleted={async () => {
          controller.setSelected([]);
          setActionAccount(null);
          await controller.load();
        }}
      />
    </div>
  );
}
