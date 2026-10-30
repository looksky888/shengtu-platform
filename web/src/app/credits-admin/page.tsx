"use client";

import { Coins, CreditCard, LoaderCircle, ReceiptText } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { CopyAssistDialog } from "@/app/credits-admin/copy-assist-dialog";
import { CreditCardsSection } from "@/app/credits-admin/credit-cards-section";
import { CreditLedgerSection } from "@/app/credits-admin/credit-ledger-section";
import { CreditUsersSection } from "@/app/credits-admin/credit-users-section";
import { CreditsAdminHeader } from "@/app/credits-admin/credits-admin-header";
import { DisableCreditCardDialog } from "@/app/credits-admin/disable-credit-card-dialog";
import { GenerateCreditCardsDialog } from "@/app/credits-admin/generate-credit-cards-dialog";
import { GeneratedCreditCardsDialog } from "@/app/credits-admin/generated-credit-cards-dialog";
import { useCreditsAdmin, type CreditsAdminTab } from "@/app/credits-admin/use-credits-admin";
import { AdjustCreditsDialog } from "@/components/adjust-credits-dialog";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

function parseCreditsAdminTab(raw: string | null): CreditsAdminTab {
  if (raw === "ledger") return "ledger";
  if (raw === "users") return "users";
  return "cards";
}

function CreditsAdminContent({ session }: { session: NonNullable<ReturnType<typeof useAuthGuard>["session"]> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseCreditsAdminTab(searchParams.get("tab"));
  const state = useCreditsAdmin(session, activeTab);

  const handleTabChange = (nextTab: CreditsAdminTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "cards") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const tabs: readonly SubNavItem<CreditsAdminTab>[] = [
    {
      value: "cards",
      label: "卡密生成与管理",
      icon: CreditCard,
      badge: state.cardsTotal,
    },
    {
      value: "ledger",
      label: "全站积分流水",
      icon: ReceiptText,
      badge: state.ledgerTotal,
    },
    {
      value: "users",
      label: "用户余额与调账",
      icon: Coins,
      badge: state.accountCount,
    },
  ];

  const tabDescription =
    activeTab === "cards"
      ? "集中管理积分兑换卡密生成、状态筛选与批量复制"
      : activeTab === "ledger"
        ? "按来源或用户检索全平台积分收支与自动退款记录"
        : "查看各账户实时算力积分余额并执行人工增减调账";

  const isManualTarget = Boolean(state.adjustingAccount && !state.adjustingAccount.user_id);
  const resolvedUserId = (state.adjustingAccount?.user_id || state.manualAdjustUserId).trim();
  const matchedManualAccount =
    isManualTarget && resolvedUserId
      ? state.users.find((item) => item.user_id === resolvedUserId)
      : undefined;
  const hasKnownBalance = !isManualTarget || Boolean(matchedManualAccount);
  const currentBalance = isManualTarget
    ? (matchedManualAccount?.balance ?? 0)
    : (state.adjustingAccount?.balance ?? 0);

  return (
    <section className="flex flex-col gap-5">
      <CreditsAdminHeader state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          items={tabs}
          value={activeTab}
          onValueChange={handleTabChange}
          variant="pill"
          ariaLabel="积分管理栏目切换"
          layoutId="credits-admin-subnav"
        />
        <span className="text-xs text-muted-foreground">
          {tabDescription}
        </span>
      </div>
      {activeTab === "cards" ? (
        <CreditCardsSection state={state} />
      ) : activeTab === "ledger" ? (
        <CreditLedgerSection state={state} />
      ) : (
        <CreditUsersSection state={state} />
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
    </section>
  );
}

export default function CreditsAdminPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/credits-admin");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <CreditsAdminContent session={session} />;
}
