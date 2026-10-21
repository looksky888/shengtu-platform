import { Copy } from "lucide-react";

import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function GeneratedCreditCardsDialog({ state }: { state: CreditsAdminState }) {
  return (
    <Dialog open={state.generatedCards.length > 0} onOpenChange={(open) => (!open ? state.setGeneratedCards([]) : null)}>
      <DialogContent className="max-w-3xl rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>新生成的兑换码</DialogTitle>
          <DialogDescription className="text-sm leading-6">这些明文兑换码已同步保存到管理员卡密列表，建议仍立即复制或导出保存。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {state.generatedCards.map((item) => (
            <div key={`${item.id}-${item.key}`} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{item.id}</span>
                <Badge variant="info" className="rounded-md">{formatCreditNumber(item.amount)} 积分</Badge>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground">{item.key}</code>
                <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => void state.handleCopy(item.key)}><Copy className="size-4" />复制</Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-9 rounded-lg px-4" onClick={() => state.setGeneratedCards([])}>关闭</Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={() => void state.handleCopy(state.copyGeneratedKeysText(state.generatedCards))}><Copy className="size-4" />复制全部</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}