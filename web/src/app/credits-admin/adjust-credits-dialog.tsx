import { Coins, LoaderCircle } from "lucide-react";

import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AdjustCreditsDialog({ state }: { state: CreditsAdminState }) {
  return (
    <Dialog open={Boolean(state.adjustingAccount)} onOpenChange={(open) => { if (!open) state.resetAdjustDialog(); }}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>调整用户积分</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            为 {state.adjustingAccount?.user_id || "-"} 手动增加或扣减积分。当前余额 {formatCreditNumber(state.adjustingAccount?.balance ?? 0)}, 扣减不能超过当前余额。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="credits-admin-adjust-delta">调整值</FieldLabel>
            <Input id="credits-admin-adjust-delta" value={state.adjustDelta} onChange={(event) => state.setAdjustDelta(event.target.value)} placeholder="正数增加，负数扣减，例如 10 或 -5" className="h-9 rounded-lg" inputMode="numeric" />
            <FieldDescription>正数增加，负数扣减；系统会写入积分流水，余额不足时会拒绝扣减。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="credits-admin-adjust-reason">原因说明（可选）</FieldLabel>
            <Input id="credits-admin-adjust-reason" value={state.adjustReason} onChange={(event) => state.setAdjustReason(event.target.value)} placeholder="例如：后台补偿、人工扣减、活动发放" className="h-9 rounded-lg" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-9 rounded-lg px-4" onClick={() => state.setAdjustingAccount(null)} disabled={state.isAdjustingCredits}>取消</Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={() => void state.handleAdjustUserCredits()} disabled={state.isAdjustingCredits || !state.adjustingAccount}>
            {state.isAdjustingCredits ? <LoaderCircle className="size-4 animate-spin" /> : <Coins className="size-4" />}保存调整
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}