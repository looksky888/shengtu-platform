import { Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatQuota, formatRestoreAt, maskToken, statusMeta } from "@/app/accounts/account-utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/api";

type AccountTableRowProps = {
  account: Account;
  selected: boolean;
  canExportTokens: boolean;
  canUpdateAccount: boolean;
  canRefreshAccounts: boolean;
  canDeleteAccounts: boolean;
  isUpdating: boolean;
  isRefreshing: boolean;
  isDeleting: boolean;
  onSelectedChange: (checked: boolean) => void;
  onEdit: (account: Account) => void;
  onRefresh: (account: Account) => void;
  onDelete: (account: Account) => void;
};

export function AccountTableRow({ account, selected, canExportTokens, canUpdateAccount, canRefreshAccounts, canDeleteAccounts, isUpdating, isRefreshing, isDeleting, onSelectedChange, onEdit, onRefresh, onDelete }: AccountTableRowProps) {
  const status = statusMeta[account.status];
  const StatusIcon = status.icon;
  const restore = formatRestoreAt(account.restoreAt);

  return (
    <TableRow className="text-sm text-muted-foreground">
      <TableCell><Checkbox checked={selected} onCheckedChange={(checked) => onSelectedChange(Boolean(checked))} /></TableCell>
      <TableCell><TokenCell account={account} canExportTokens={canExportTokens} /></TableCell>
      <TableCell><Badge variant="secondary" className="rounded-md">{account.type}</Badge></TableCell>
      <TableCell><Badge variant={status.badge} className="inline-flex items-center gap-1 rounded-md px-2 py-1"><StatusIcon className="size-3.5" />{account.status}</Badge></TableCell>
      <TableCell><div className="text-xs leading-5 text-muted-foreground">{account.email ?? "—"}</div></TableCell>
      <TableCell><Badge variant="info" className="rounded-md">{formatQuota(account)}</Badge></TableCell>
      <TableCell className="text-xs leading-5 text-muted-foreground"><div className="space-y-0.5">{restore.relative ? <div className="font-medium text-foreground">{restore.relative}</div> : null}<div>{restore.absolute}</div></div></TableCell>
      <TableCell>{account.success}</TableCell>
      <TableCell>{account.fail}</TableCell>
      <TableCell><RowActions account={account} canUpdateAccount={canUpdateAccount} canRefreshAccounts={canRefreshAccounts} canDeleteAccounts={canDeleteAccounts} isUpdating={isUpdating} isRefreshing={isRefreshing} isDeleting={isDeleting} onEdit={onEdit} onRefresh={onRefresh} onDelete={onDelete} /></TableCell>
    </TableRow>
  );
}

function TokenCell({ account, canExportTokens }: { account: Account; canExportTokens: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium tracking-tight text-foreground">{maskToken(account.access_token || account.token_preview || account.id)}</span>
      {canExportTokens && account.access_token ? (
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => {
            void copyText(account.access_token || "")
              .then(() => toast.success("token 已复制"))
              .catch(() => toast.error("复制失败，请手动复制"));
          }}
        >
          <Copy className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function RowActions({ account, canUpdateAccount, canRefreshAccounts, canDeleteAccounts, isUpdating, isRefreshing, isDeleting, onEdit, onRefresh, onDelete }: Omit<AccountTableRowProps, "selected" | "canExportTokens" | "onSelectedChange">) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {canUpdateAccount ? <button type="button" className="rounded-md p-2 transition hover:bg-muted hover:text-foreground" onClick={() => onEdit(account)} disabled={isUpdating}><Pencil className="size-4" /></button> : null}
      {canRefreshAccounts ? <button type="button" className="rounded-md p-2 transition hover:bg-muted hover:text-foreground" onClick={() => onRefresh(account)} disabled={isRefreshing}><RefreshCw className={cn("size-4", isRefreshing ? "animate-spin" : "")} /></button> : null}
      {canDeleteAccounts ? <button type="button" className="rounded-lg p-2 transition hover:bg-rose-50 hover:text-rose-500" onClick={() => onDelete(account)} disabled={isDeleting}><Trash2 className="size-4" /></button> : null}
    </div>
  );
}