import { AlertCircle, CheckCircle2, ServerCog, X } from "lucide-react";
import { useState } from "react";

import { GrokProviderConfigDialog, type GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import { GrokProviderDeleteDialog } from "@/app/accounts/grok-provider-delete-dialog";
import { GrokProviderImportDialog } from "@/app/accounts/grok-provider-import-dialog";
import { GrokProviderSummary } from "@/app/accounts/grok-provider-summary";
import { GrokProviderTable } from "@/app/accounts/grok-provider-table";
import { GrokProviderTableEmpty, GrokProviderTableError, GrokProviderTableSkeleton } from "@/app/accounts/grok-provider-table-state";
import { GrokProviderTaskProgress } from "@/app/accounts/grok-provider-task-progress";
import { GrokProviderToolbar } from "@/app/accounts/grok-provider-toolbar";
import { useGrokProviderCenter, type GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export function GrokProviderCenter({ session }: { session: StoredAuthSession }) {
  const controller = useGrokProviderCenter();
  const [importOpen, setImportOpen] = useState(false);
  const [configKind, setConfigKind] = useState<GrokConfigDialogKind>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionAccount, setActionAccount] = useState<GrokProviderRow | null>(null);
  const canWrite = hasAPIPermission(session, "post", "/api/grok");
  const canDelete = hasAPIPermission(session, "delete", "/api/grok");
  const summary = controller.data?.summary;
  const task = controller.task;
  const dialogAccounts = actionAccount ? [actionAccount] : controller.selectedAccounts;
  const dialogProvider = actionAccount?.provider || controller.selectedProvider;
  const filtered = controller.provider !== "all" || controller.status !== "all" || Boolean(controller.keyword.trim());
  const openConfig = (kind: GrokConfigDialogKind, account?: GrokProviderRow) => { setActionAccount(account || null); setConfigKind(kind); };
  const openDelete = (account?: GrokProviderRow) => { setActionAccount(account || null); setDeleteOpen(true); };
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4 lg:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2"><ServerCog className="size-5 text-brand" /><h2 className="text-lg font-semibold tracking-tight">上游账号</h2></div>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground sm:text-sm">管理 Grok 账号、额度与健康状态。</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {task ? <GrokProviderTaskProgress task={task} defaultOpen={controller.taskAutoOpen} /> : null}
          {controller.data ? <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-muted/60 px-3 py-1 text-xs text-muted-foreground">{controller.data.projection.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <AlertCircle className="size-3.5 text-rose-600" />}投影{controller.data.projection.status === "success" ? "正常" : "异常"}</div> : null}
        </div>
      </header>

      <GrokProviderSummary summary={summary} />

      {controller.actionError ? (
        <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 lg:mx-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{controller.actionError}</span>
          </div>
          <button
            type="button"
            onClick={controller.clearActionError}
            className="inline-flex size-6 items-center justify-center rounded-lg hover:bg-rose-500/15"
            aria-label="关闭错误提示"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <GrokProviderToolbar
        controller={controller}
        canWrite={canWrite}
        canDelete={canDelete}
        isAdmin={session.role === "admin"}
        onImport={() => setImportOpen(true)}
        onConfigure={(kind) => openConfig(kind)}
        onDelete={() => openDelete()}
      />

      {controller.error && !controller.data ? (
        <GrokProviderTableError message={controller.error} loading={controller.loading} onRetry={() => void controller.load()} />
      ) : controller.loading && !controller.data ? (
        <GrokProviderTableSkeleton />
      ) : controller.data?.items.length === 0 ? (
        <GrokProviderTableEmpty filtered={filtered} canWrite={canWrite} onImport={() => setImportOpen(true)} />
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

      <GrokProviderImportDialog open={importOpen} busy={controller.busy} onOpenChange={setImportOpen} onSubmit={controller.importAccounts} />
      <GrokProviderConfigDialog
        kind={configKind}
        count={dialogAccounts.length}
        busy={controller.busy}
        onOpenChange={(open) => { if (!open) { setConfigKind(null); setActionAccount(null); } }}
        onConcurrency={(value) => controller.setConcurrency(value, actionAccount ? controller.accountScope(actionAccount) : undefined)}
        onEgress={(mode, proxyUrl) => controller.setEgress(mode, proxyUrl, actionAccount ? controller.accountScope(actionAccount) : undefined)}
      />
      <GrokProviderDeleteDialog
        open={deleteOpen}
        provider={dialogProvider}
        accountIds={dialogAccounts.map((item) => item.id)}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setActionAccount(null); }}
        onDeleted={async () => { controller.setSelected([]); setActionAccount(null); await controller.load(); }}
      />
    </section>
  );
}
