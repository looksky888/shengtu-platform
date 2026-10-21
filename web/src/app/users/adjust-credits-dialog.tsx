import { Coins, LoaderCircle } from "lucide-react";

import { formatCreditNumber } from "@/app/users/users-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ManagedUser } from "@/lib/api";

type AdjustCreditsDialogProps = {
  user: ManagedUser | null;
  balance: number;
  delta: string;
  reason: string;
  isAdjusting: boolean;
  onOpenChange: (open: boolean) => void;
  onDeltaChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
};

export function AdjustCreditsDialog({ user, balance, delta, reason, isAdjusting, onOpenChange, onDeltaChange, onReasonChange, onSave }: AdjustCreditsDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>调整用户积分</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            为「{user?.name || user?.username || user?.id || "—"}」手动增加或扣减积分。当前余额 {formatCreditNumber(balance)}。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-foreground">调整值</label>
            <Input value={delta} onChange={(event) => onDeltaChange(event.target.value)} placeholder="正数增加，负数扣减，例如 10 或 -5" className="h-9 rounded-lg" inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-foreground">原因说明（可选）</label>
            <Input value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="例如：后台补偿、人工扣减、活动发放" className="h-9 rounded-lg" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-9 rounded-lg px-4" onClick={() => onOpenChange(false)} disabled={isAdjusting}>取消</Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={onSave} disabled={isAdjusting || !user}>
            {isAdjusting ? <LoaderCircle className="size-4 animate-spin" /> : <Coins className="size-4" />}
            保存调整
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}