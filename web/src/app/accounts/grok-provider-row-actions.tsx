import {
  Activity, Download, Gauge, MoreHorizontal, Network, Power, PowerOff, ShieldCheck,
  SquareTerminal, Trash2, Webhook,
} from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import type { GrokConfigDialogKind } from "@/app/accounts/grok-provider-config-dialog";
import type { GrokProviderCenterController, GrokProviderRow } from "@/app/accounts/use-grok-provider-center";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  account: GrokProviderRow;
  controller: GrokProviderCenterController;
  canWrite: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onConfigure: (kind: Exclude<GrokConfigDialogKind, null>, account: GrokProviderRow) => void;
  onDelete: (account: GrokProviderRow) => void;
};

function ActionButton({ children, danger = false, ...props }: ComponentProps<"button"> & { danger?: boolean }) {
  return <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30 ${danger ? "text-rose-700" : "text-foreground"}`} {...props}>{children}</button>;
}

export function GrokProviderRowActions({ account, controller, canWrite, canDelete, isAdmin, onConfigure, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const scope = controller.accountScope(account);
  const run = (action: () => void) => { setOpen(false); action(); };
  const disabled = controller.busy || !canWrite;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`管理 ${account.display_name || account.id}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5">
        <ActionButton disabled={disabled} onClick={() => run(() => controller.setEnabled(account.status !== "active", scope))}>
          {account.status === "active" ? <PowerOff className="size-4" /> : <Power className="size-4" />}{account.status === "active" ? "停用账号" : "启用账号"}
        </ActionButton>
        <ActionButton disabled={disabled} onClick={() => run(() => onConfigure("concurrency", account))}><Gauge className="size-4" />设置并发</ActionButton>
        <ActionButton disabled={disabled} onClick={() => run(() => onConfigure("egress", account))}><Network className="size-4" />配置出口</ActionButton>
        <ActionButton disabled={disabled} onClick={() => run(() => controller.syncQuota(scope))}><Activity className="size-4" />同步额度</ActionButton>
        <ActionButton disabled={disabled} onClick={() => run(() => controller.detect(scope))}><ShieldCheck className="size-4" />检测账号</ActionButton>
        {account.provider === "web" ? (
          <>
            <ActionButton disabled={disabled} onClick={() => run(() => controller.convert("console", scope))}><Webhook className="size-4" />转 Console</ActionButton>
            <ActionButton disabled={disabled} onClick={() => run(() => controller.convert("build", scope))}><SquareTerminal className="size-4" />转 Build</ActionButton>
          </>
        ) : null}
        <div className="my-1 h-px bg-border" />
        <ActionButton disabled={disabled} onClick={() => run(() => void controller.exportAccounts("redacted", scope))}><Download className="size-4" />脱敏导出</ActionButton>
        {isAdmin ? <ActionButton disabled={disabled} onClick={() => run(() => void controller.exportAccounts("credentials", scope))}><Download className="size-4" />完整凭据</ActionButton> : null}
        <ActionButton danger disabled={controller.busy || !canDelete} onClick={() => run(() => onDelete(account))}><Trash2 className="size-4" />删除账号</ActionButton>
      </PopoverContent>
    </Popover>
  );
}
