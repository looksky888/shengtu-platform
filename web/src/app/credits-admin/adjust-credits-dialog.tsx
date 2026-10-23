import { AlertTriangle, ArrowRight, Minus, Plus } from "lucide-react";

import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CREDIT_PRESETS = [50, 100, 500, 1000, 5000] as const;

export function AdjustCreditsDialog({ state }: { state: CreditsAdminState }) {
  const isManualTarget = Boolean(state.adjustingAccount && !state.adjustingAccount.user_id);
  const resolvedUserId = (state.adjustingAccount?.user_id || state.manualAdjustUserId).trim();
  const direction = state.adjustMode === "deduct" ? "deduct" : "add";
  const absAmount = Math.max(0, Math.trunc(Number(state.adjustDelta) || 0));

  const matchedManualAccount =
    isManualTarget && resolvedUserId
      ? state.users.find((item) => item.user_id === resolvedUserId)
      : undefined;
  const hasKnownBalance = !isManualTarget || Boolean(matchedManualAccount);
  const currentBalance = isManualTarget
    ? (matchedManualAccount?.balance ?? 0)
    : (state.adjustingAccount?.balance ?? 0);
  const nextBalance = direction === "deduct" ? currentBalance - absAmount : currentBalance + absAmount;
  const isInsufficient = hasKnownBalance && direction === "deduct" && nextBalance < 0;

  return (
    <Dialog open={Boolean(state.adjustingAccount)} onOpenChange={(open) => { if (!open) state.resetAdjustDialog(); }}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>调整用户积分</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {isManualTarget
              ? "输入指定用户的 ID 手动增加或扣减积分，变更将实时写入全平台积分流水。"
              : `为 ${state.adjustingAccount?.user_id || "-"} 手动增加或扣减积分，变更将实时写入全平台积分流水。`}
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="调整方向"
          className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted/95 p-1 dark:bg-zinc-900"
        >
          <button
            type="button"
            role="radio"
            aria-checked={direction === "add"}
            onClick={() => state.handleAdjustModeChange("add")}
            disabled={state.isAdjustingCredits}
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
            onClick={() => state.handleAdjustModeChange("deduct")}
            disabled={state.isAdjustingCredits}
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

        <FieldGroup>
          {isManualTarget ? (
            <Field>
              <FieldLabel htmlFor="credits-admin-target-user">目标用户 ID</FieldLabel>
              <Input
                id="credits-admin-target-user"
                value={state.manualAdjustUserId}
                onChange={(event) => state.setManualAdjustUserId(event.target.value)}
                placeholder="请输入用户 ID（例如 local_... 或 usr_...）"
                className="h-9 rounded-lg font-mono text-xs"
                disabled={state.isAdjustingCredits}
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="credits-admin-adjust-delta">
              {direction === "deduct" ? "扣减数量" : "增加数量"}
            </FieldLabel>
            <Input
              id="credits-admin-adjust-delta"
              type="text"
              inputMode="numeric"
              min={1}
              value={state.adjustDelta}
              onChange={(event) => state.setAdjustDelta(event.target.value)}
              placeholder="请输入正整数积分数量，例如 100"
              className="h-9 rounded-lg tabular-nums"
              disabled={state.isAdjustingCredits}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {CREDIT_PRESETS.map((preset) => {
                const active = absAmount === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={state.isAdjustingCredits}
                    onClick={() => state.setAdjustDelta(String(preset))}
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
          </Field>

          <div
            className={cn(
              "rounded-xl border border-border/75 bg-surface-subtle/60 px-3.5 py-2.5 text-xs tabular-nums",
              isInsufficient && "border-status-danger/35 bg-status-danger-soft/55",
            )}
          >
            {hasKnownBalance ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  当前余额: <strong className="font-semibold text-foreground">{formatCreditNumber(currentBalance)} 积分</strong>
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
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  当前余额: <strong className="font-medium text-foreground">按用户账本实时核算</strong>
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  本次变动:{" "}
                  <strong
                    className={cn(
                      "font-semibold",
                      direction === "deduct" ? "text-status-danger" : "text-status-success",
                    )}
                  >
                    {direction === "deduct" ? "-" : "+"}
                    {formatCreditNumber(absAmount)} 积分
                  </strong>
                </span>
              </div>
            )}
            {isInsufficient ? (
              <div className="mt-2 flex items-center gap-1.5 text-status-danger">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>余额不足：扣减额度超出当前余额 {formatCreditNumber(Math.abs(nextBalance))} 积分</span>
              </div>
            ) : null}
          </div>

          <Field>
            <FieldLabel htmlFor="credits-admin-adjust-reason">原因说明（可选）</FieldLabel>
            <Input
              id="credits-admin-adjust-reason"
              value={state.adjustReason}
              onChange={(event) => state.setAdjustReason(event.target.value)}
              placeholder="例如：后台补偿、人工扣减、活动发放"
              className="h-9 rounded-lg"
              disabled={state.isAdjustingCredits}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg px-4"
            onClick={() => state.resetAdjustDialog()}
            disabled={state.isAdjustingCredits}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={direction === "deduct" ? "destructive" : "default"}
            loading={state.isAdjustingCredits}
            className="h-9 rounded-lg px-4 tabular-nums"
            onClick={() => void state.handleAdjustUserCredits()}
            disabled={state.isAdjustingCredits || !state.adjustingAccount || !resolvedUserId || absAmount < 1}
          >
            {!state.isAdjustingCredits ? (
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