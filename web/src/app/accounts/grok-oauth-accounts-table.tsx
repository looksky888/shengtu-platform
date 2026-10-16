import { Power, PowerOff, RefreshCw, Trash2, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatGrokDateTime } from "@/lib/grok-accounts-api";

import type { GrokOAuthController } from "./use-grok-oauth-panel";

export function GrokOAuthAccountsTable({ controller }: { controller: GrokOAuthController }) {
  const { accounts, loading, busy, handleRefresh, handleSyncModels, handleToggle, handleRemove } = controller;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">账号</th>
            <th className="px-3 py-2 font-medium">状态</th>
            <th className="px-3 py-2 font-medium">模型</th>
            <th className="px-3 py-2 font-medium">更新</th>
            <th className="px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
              {loading ? "加载中..." : "暂无 OAuth 账号，请导入凭据、设备码或一键协议连接"}
            </td></tr>
          ) : accounts.map((account) => {
            const disabled = String(account.status || "").toLowerCase() === "disabled";
            return (
              <tr key={account.id} className="border-t border-border/70">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{account.email || account.subject_preview || account.subject || account.id}</p>
                  <p className="mt-0.5 max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground">{account.id}</p>
                </td>
                <td className="px-3 py-2"><Badge variant={disabled ? "secondary" : "success"}>{account.status || "active"}</Badge></td>
                <td className="max-w-[10rem] truncate px-3 py-2 font-mono text-[11px]">{(account.models || []).slice(0, 3).join(", ") || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatGrokDateTime(account.updated_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void handleRefresh(account.id)} title="刷新 Token"><RefreshCw className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void handleSyncModels(account.id)} title="同步模型"><Zap className="size-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void handleToggle(account)} title={disabled ? "启用" : "禁用"}>
                      {disabled ? <Power className="size-3.5" /> : <PowerOff className="size-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" disabled={busy} onClick={() => void handleRemove(account.id)} title="删除"><Trash2 className="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
