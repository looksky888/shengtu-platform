"use client";

import { useState } from "react";
import { LoaderCircle, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";

import { CopyAssistDialog } from "@/app/credits-admin/copy-assist-dialog";
import { CreditCardsSection } from "@/app/credits-admin/credit-cards-section";
import { CreditLedgerSection } from "@/app/credits-admin/credit-ledger-section";
import { CreditUsersSection } from "@/app/credits-admin/credit-users-section";
import { formatCreditNumber } from "@/app/credits-admin/credits-admin-utils";
import { DisableCreditCardDialog } from "@/app/credits-admin/disable-credit-card-dialog";
import { GenerateCreditCardsDialog } from "@/app/credits-admin/generate-credit-cards-dialog";
import { GeneratedCreditCardsDialog } from "@/app/credits-admin/generated-credit-cards-dialog";
import { useCreditsAdmin } from "@/app/credits-admin/use-credits-admin";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminUnderlineTabs,
} from "@/components/admin";
import { AdjustCreditsDialog } from "@/components/adjust-credits-dialog";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

type CreditsHubTab = "codes" | "ledger";

const CREDITS_TABS = [
  { value: "codes" as const, label: "兑换码批次管理" },
  { value: "ledger" as const, label: "人工调账与积分流水" },
] as const;

function AdminCreditsContent({ session }: { session: StoredAuthSession }) {
  const [activeTab, setActiveTab] = useState<CreditsHubTab>("codes");
  const [ledgerSubView, setLedgerSubView] = useState<"ledger" | "users">("ledger");

  const hookTab =
    activeTab === "codes" ? "cards" : ledgerSubView === "users" ? "users" : "ledger";
  const state = useCreditsAdmin(session, hookTab);

  const totalGeneratedCards = Math.max(
    state.cardsTotal,
    state.activeCardCount + state.usedCardCount,
  );

  const isManualTarget = Boolean(
    state.adjustingAccount && !state.adjustingAccount.user_id,
  );
  const resolvedUserId = (
    state.adjustingAccount?.user_id || state.manualAdjustUserId
  ).trim();
  const matchedManualAccount =
    isManualTarget && resolvedUserId
      ? state.users.find((item) => item.user_id === resolvedUserId)
      : undefined;
  const hasKnownBalance = !isManualTarget || Boolean(matchedManualAccount);
  const currentBalance = isManualTarget
    ? (matchedManualAccount?.balance ?? 0)
    : (state.adjustingAccount?.balance ?? 0);

  return (
    <AdminPageFrame
      groupLabel="商业与运营"
      title="积分与卡密"
      description="批量生成算力兑换卡密、核销状态检索、人工账户增减分调账与全站积分收支流水审计。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.isLoading}
            onClick={() => void state.loadData()}
          >
            <RefreshCw className={cn("size-3.5", state.isLoading && "animate-spin")} />
            刷新
          </Button>
          {state.permissions.canManageCredits ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={state.openManualAdjustCreditsDialog}
              >
                <SlidersHorizontal className="size-3.5" />
                人工调账
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => state.setIsGenerateDialogOpen(true)}
              >
                <Plus className="size-3.5" />
                生成卡密
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatTile
          label="兑换码总量"
          value={`${formatCreditNumber(totalGeneratedCards)} 张`}
          hint={`当前可用 ${state.activeCardCount} 张`}
        />
        <AdminStatTile
          label="待核销 / 已使用"
          value={`${state.activeCardCount} / ${state.usedCardCount}`}
          tone={state.activeCardCount > 0 ? "success" : "default"}
          hint={
            totalGeneratedCards > 0
              ? `核销率 ${Math.round((state.usedCardCount / totalGeneratedCards) * 100)}%`
              : "尚无核销记录"
          }
        />
        <AdminStatTile
          label="积分账户总数"
          value={formatCreditNumber(state.accountCount)}
          hint="已开通算力积分账本的用户数"
        />
        <AdminStatTile
          label="全站流水记录"
          value={formatCreditNumber(state.ledgerTotal)}
          hint="含充值、卡密兑换、消费扣费与自动退款"
        />
      </div>

      <AdminUnderlineTabs
        items={CREDITS_TABS.map((item) => ({
          ...item,
          badge: item.value === "codes" ? state.cardsTotal : state.ledgerTotal,
        }))}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="codes"
      />

      {activeTab === "codes" ? (
        <CreditCardsSection state={state} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] p-0.5">
              <button
                type="button"
                onClick={() => setLedgerSubView("ledger")}
                className={cn(
                  "h-7 rounded-[5px] px-3 text-[12px] font-medium transition-colors",
                  ledgerSubView === "ledger"
                    ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
                    : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                )}
              >
                全站积分收支流水 ({state.ledgerTotal})
              </button>
              <button
                type="button"
                onClick={() => setLedgerSubView("users")}
                className={cn(
                  "h-7 rounded-[5px] px-3 text-[12px] font-medium transition-colors",
                  ledgerSubView === "users"
                    ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
                    : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                )}
              >
                用户实时余额与调账 ({state.accountCount})
              </button>
            </div>
          </div>

          {ledgerSubView === "ledger" ? (
            <CreditLedgerSection state={state} />
          ) : (
            <CreditUsersSection state={state} />
          )}
        </div>
      )}

      <GenerateCreditCardsDialog state={state} />
      <GeneratedCreditCardsDialog state={state} />
      <DisableCreditCardDialog state={state} />
      <AdjustCreditsDialog
        open={Boolean(state.adjustingAccount)}
        targetLabel={state.adjustingAccount?.user_id}
        manualTarget={
          isManualTarget
            ? {
                value: state.manualAdjustUserId,
                onChange: state.setManualAdjustUserId,
              }
            : undefined
        }
        balance={currentBalance}
        hasKnownBalance={hasKnownBalance}
        mode={state.adjustMode}
        delta={state.adjustDelta}
        reason={state.adjustReason}
        isAdjusting={state.isAdjustingCredits}
        canSubmit={Boolean(state.adjustingAccount && resolvedUserId)}
        onOpenChange={(open) => {
          if (!open) state.resetAdjustDialog();
        }}
        onModeChange={state.handleAdjustModeChange}
        onDeltaChange={state.setAdjustDelta}
        onReasonChange={state.setAdjustReason}
        onSave={() => void state.handleAdjustUserCredits()}
      />
      <CopyAssistDialog state={state} />
    </AdminPageFrame>
  );
}

export default function AdminCreditsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/credits");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  return <AdminCreditsContent session={session} />;
}
