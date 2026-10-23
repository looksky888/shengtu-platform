import { AlertTriangle, ArrowRight, Minus, Plus } from "lucide-react";

import { formatCreditNumber, type CreditAdjustMode } from "@/app/users/users-utils";
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
import { cn } from "@/lib/utils";

const CREDIT_PRESETS = [50, 100, 500, 1000, 5000] as const;

type AdjustCreditsDialogProps = {
  user: ManagedUser | null;
  balance: number;
  mode?: CreditAdjustMode;
  delta: string;
  reason: string;
  isAdjusting: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: CreditAdjustMode) => void;
  onDeltaChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
};

export function AdjustCreditsDialog({
  user,
  balance,
  mode = "add",
  delta,
  reason,
  isAdjusting,
  onOpenChange,
  onModeChange,
  onDeltaChange,
  onReasonChange,
  onSave,
}: AdjustCreditsDialogProps) {
  const direction: CreditAdjustMode = mode === "deduct" ? "deduct" : "add";
  const absAmount = Math.max(0, Math.trunc(Number(delta) || 0));
  const nextBalance = direction === "deduct" ? balance - absAmount : balance + absAmount;
  const isInsufficient = direction === "deduct" && nextBalance < 0;

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>调整用户积分</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            为「{user?.name || user?.username || user?.id || "—"}」手动增加或扣减积分，变更将实时写入积分流水。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div
            role="radiogroup"
            aria-label="调整方向"
            className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted/95 p-1 dark:bg-zinc-900"
          >
            <button
              type="button"
              role="radio"
              aria-checked={direction === "add"}
              onClick={() => onModeChange("add")}
              disabled={isAdjusting}
              className={cn(
                "inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                direction === "add"
                  ? "bg-surface text-foreground shadow-2xs ring-1 ring-border/75 dark:bg-zinc-800"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className={cn("size-3.5", direction === "add" ? "text-status-success" : "text-muted-foreground")} />
              + 增加积分
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={direction === "deduct"}
              onClick={() => onModeChange("deduct")}
              disabled={isAdjusting}
              className={cn(
                "inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                direction === "deduct"
                  ? "bg-surface text-status-danger shadow-2xs ring-1 ring-status-danger/30 dark:bg-zinc-800"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Minus className="size-3.5" />
              - 扣减积分
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="users-adjust-credits-amount" className="text-sm font-medium text-foreground">
              {direction === "deduct" ? "扣减数量" : "增加数量"}
            </label>
            <Input
              id="users-adjust-credits-amount"
              type="text"
              inputMode="numeric"
              min={1}
              value={delta}
              onChange={(event) => onDeltaChange(event.target.value)}
              placeholder="请输入正整数积分数量，例如 100"
              className="h-9 rounded-lg tabular-nums"
              disabled={isAdjusting}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {CREDIT_PRESETS.map((preset) => {
                const active = absAmount === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={isAdjusting}
                    onClick={() => onDeltaChange(String(preset))}
                    className={cn(
                      "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors",
                      active
                        ? direction === "deduct"
                          ? "border-status-danger/40 bg-status-danger-soft text-status-danger"
                          : "border-foreground/25 bg-surface-active text-foreground"
                        : "border-border/75 bg-surface hover:bg-surface-hover text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border border-border/75 bg-surface-subtle/60 px-3.5 py-2.5 text-xs tabular-nums",
              isInsufficient && "border-status-danger/35 bg-status-danger-soft/55",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                当前余额: <strong className="font-semibold text-foreground">{formatCreditNumber(balance)} 积分</strong>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                变更后余额:{" "}
                <strong
                  className={cn(
                    "font-semibold",
                    isInsufficient
                      ? "text-status-danger"
                      : absAmount > 0 && direction === "add"
                        ? "text-status-success"
                        : "text-foreground",
                  )}
                >
                  {formatCreditNumber(nextBalance)} 积分
                </strong>
              </span>
            </div>
            {isInsufficient ? (
              <div className="mt-2 flex items-center gap-1.5 text-status-danger">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>余额不足：扣减额度超出当前余额 {formatCreditNumber(Math.abs(nextBalance))} 积分</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="users-adjust-credits-reason" className="text-sm font-medium text-foreground">
              原因说明（可选）
            </label>
            <Input
              id="users-adjust-credits-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="例如：后台补偿、人工扣减、活动发放"
              className="h-9 rounded-lg"
              disabled={isAdjusting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg px-4"
            onClick={() => onOpenChange(false)}
            disabled={isAdjusting}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={direction === "deduct" ? "destructive" : "default"}
            loading={isAdjusting}
            className="h-9 rounded-lg px-4 tabular-nums"
            onClick={onSave}
            disabled={isAdjusting || !user || absAmount < 1}
          >
            {!isAdjusting ? (
              direction === "deduct" ? (
                <Minus className="size-4" />
              ) : (
                <Plus className="size-4" />
              )
            ) : null}
            {direction === "deduct"
              ? `确认扣减 ${absAmount || 0} 积分`
              : `确认增加 ${absAmount || 0} 积分`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}