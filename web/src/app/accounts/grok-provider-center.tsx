import { AlertCircle, CheckCircle2, ServerCog } from "lucide-react";
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
    <section className="overflow-hidden rounded-[24px] border border-[#1456f0]/15 bg-white shadow-[0_14px_38px_-24px_rgba(44,30,116,0.38)] dark:bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-5 lg:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2"><ServerCog className="size-5 text-[#1456f0]" /><h2 className="text-xl font-semibold tracking-tight">上游账号</h2></div>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">管理 Grok 账号、额度与健康状态。</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {task ? <GrokProviderTaskProgress task={task} /> : null}
          {controller.data ? <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">{controller.data.projection.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <AlertCircle className="size-3.5 text-rose-600" />}投影{controller.data.projection.status === "success" ? "正常" : "异常"}</div> : null}
        </div>
      </header>

      <GrokProviderSummary summary={summary} />

      <GrokProviderToolbar
        controller={controller}
        canWrite={canWrite}
        canDelete={canDelete}
        isAdmin={session.role === "admin"}
        onImport={() => setImportOpen(true)}
        onConfigure={(kind) => openConfig(kind)}
        onDelete={() => openDelete()}
      />

      {controller.error ? <GrokProviderTableError message={controller.error} loading={controller.loading} onRetry={() => void controller.load()} /> : controller.loading && !controller.data ? <GrokProviderTableSkeleton /> : controller.data?.items.length === 0 ? <GrokProviderTableEmpty filtered={filtered} canWrite={canWrite} onImport={() => setImportOpen(true)} /> : <GrokProviderTable controller={controller} canWrite={canWrite} canDelete={canDelete} isAdmin={session.role === "admin"} onConfigure={openConfig} onDelete={openDelete} />}

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
