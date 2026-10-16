import {
  Activity, Download, Gauge, LoaderCircle, Network, Plus, Power, PowerOff,
  RefreshCw, Settings2, ShieldCheck, Trash2, WandSparkles, Webhook,
} from "lucide-react";

import { GrokAllProvidersIcon, GrokProviderIcon } from "@/app/accounts/grok-provider-icons";
import type { GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import type { GrokProviderCenterController } from "@/app/accounts/use-grok-provider-center";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  controller: GrokProviderCenterController;
  canWrite: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onImport: () => void;
  onConfigure: (kind: GrokConfigDialogKind) => void;
  onDelete: () => void;
};

export function GrokProviderToolbar({ controller, canWrite, canDelete, isAdmin, onImport, onConfigure, onDelete }: Props) {
  const selected = controller.selectedAccounts.length;
  const scoped = selected > 0 && Boolean(controller.selectedProvider);
  const disabled = controller.busy || !canWrite;
  const tabs = [
    { value: "all", label: "全部", count: controller.data?.summary.total },
    { value: "build", label: "Build", count: controller.data?.summary.by_provider.build },
    { value: "web", label: "Web", count: controller.data?.summary.by_provider.web },
    { value: "console", label: "Console", count: controller.data?.summary.by_provider.console },
  ] as const;
  return (
    <div className="grid gap-3 border-b border-border/70 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full bg-muted/70 p-1">
          {tabs.map((tab) => {
            const active = controller.provider === tab.value;
            return <button key={tab.value} type="button" aria-pressed={active} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30", active ? "bg-white font-medium text-[#1456f0] shadow-sm dark:bg-card" : "text-muted-foreground hover:text-foreground")} onClick={() => controller.setProvider(tab.value)}>
              {tab.value === "all" ? <GrokAllProvidersIcon className="size-3.5" /> : <GrokProviderIcon provider={tab.value} className="size-3.5" />}
              {tab.label}<span className="text-[11px] tabular-nums opacity-70">{tab.count ?? "—"}</span>
            </button>;
          })}
        </div>
        <Button className="rounded-full" disabled={disabled} onClick={onImport}><Plus className="size-4" />账号接入</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="搜索 Grok Provider 账号" className="h-10 min-w-52 flex-1 rounded-full sm:max-w-xs" placeholder="搜索账号、掩码邮箱或来源" value={controller.keyword} onChange={(event) => controller.setKeyword(event.target.value)} />
        <select aria-label="Provider 状态筛选" className="h-10 rounded-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30" value={controller.status} onChange={(event) => controller.setStatus(event.target.value as typeof controller.status)}>
          <option value="all">全部状态</option><option value="active">可用</option><option value="disabled">已停用</option><option value="error">异常</option><option value="unknown">待检测</option>
        </select>
        <Button variant="outline" className="rounded-full" disabled={controller.loading} onClick={() => void controller.load()}><RefreshCw className={cn("size-4", controller.loading && "animate-spin")} />刷新</Button>
      </div>

      {selected > 0 ? <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-2.5">
        <span className="mr-1 px-1 text-xs text-muted-foreground">已选 {selected} 个{!scoped ? " · 批量操作需保持同一 Provider" : ""}</span>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => controller.setEnabled(true)}><Power className="size-4" />启用</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => controller.setEnabled(false)}><PowerOff className="size-4" />停用</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => onConfigure("concurrency")}><Gauge className="size-4" />并发</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => onConfigure("egress")}><Network className="size-4" />出口</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => controller.syncQuota()}><Activity className="size-4" />同步额度</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => controller.detect()}><ShieldCheck className="size-4" />检测</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped || controller.selectedProvider !== "web"} onClick={() => controller.convert("console")}><Webhook className="size-4" />转 Console</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped || controller.selectedProvider !== "web"} onClick={() => controller.convert("build")}><WandSparkles className="size-4" />转 Build</Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => void controller.exportAccounts("redacted")}><Download className="size-4" />脱敏导出</Button>
        {isAdmin ? <Button size="sm" variant="outline" className="rounded-full" disabled={disabled || !scoped} onClick={() => void controller.exportAccounts("credentials")}><Settings2 className="size-4" />完整凭据</Button> : null}
        <Button size="sm" variant="outline" className="rounded-full text-rose-700 hover:text-rose-800" disabled={controller.busy || !canDelete || !scoped} onClick={onDelete}><Trash2 className="size-4" />删除</Button>
        {controller.busy ? <span className="inline-flex items-center gap-1 px-1 text-xs text-[#1456f0]"><LoaderCircle className="size-3.5 animate-spin" />任务执行中</span> : null}
      </div> : null}
    </div>
  );
}
