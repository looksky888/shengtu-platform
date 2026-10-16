import { Ban, LoaderCircle } from "lucide-react";

import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DisableCreditCardDialog({ state }: { state: CreditsAdminState }) {
  return (
    <Dialog open={Boolean(state.disablingCard)} onOpenChange={(open) => (!open ? state.setDisablingCard(null) : null)}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>禁用卡密</DialogTitle>
          <DialogDescription className="text-sm leading-6">确认禁用卡密「{state.disablingCard?.id || "—"}」吗？禁用后该卡密将无法继续兑换。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => state.setDisablingCard(null)} disabled={state.isDisabling}>取消</Button>
          <Button type="button" className="h-10 rounded-xl px-5" onClick={() => void state.handleDisableCard()} disabled={state.isDisabling}>
            {state.isDisabling ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />}确认禁用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}