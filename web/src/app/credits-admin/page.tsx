"use client";

import { useState } from "react";
import { Coins, CreditCard, LoaderCircle } from "lucide-react";

import { AdjustCreditsDialog } from "@/app/credits-admin/adjust-credits-dialog";
import { CopyAssistDialog } from "@/app/credits-admin/copy-assist-dialog";
import { CreditCardsSection } from "@/app/credits-admin/credit-cards-section";
import { CreditLedgerSection } from "@/app/credits-admin/credit-ledger-section";
import { CreditUsersSection } from "@/app/credits-admin/credit-users-section";
import { CreditsAdminHeader } from "@/app/credits-admin/credits-admin-header";
import { DisableCreditCardDialog } from "@/app/credits-admin/disable-credit-card-dialog";
import { GenerateCreditCardsDialog } from "@/app/credits-admin/generate-credit-cards-dialog";
import { GeneratedCreditCardsDialog } from "@/app/credits-admin/generated-credit-cards-dialog";
import { useCreditsAdmin } from "@/app/credits-admin/use-credits-admin";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type CreditsAdminTab = "cards" | "ledger";

function CreditsAdminContent({ session }: { session: NonNullable<ReturnType<typeof useAuthGuard>["session"]> }) {
  const state = useCreditsAdmin(session);
  const [activeTab, setActiveTab] = useState<CreditsAdminTab>("cards");

  const tabs: readonly SubNavItem<CreditsAdminTab>[] = [
    {
      value: "cards",
      label: "卡密生成与管理",
      icon: CreditCard,
      badge: state.cardsTotal,
    },
    {
      value: "ledger",
      label: "积分流水与用户余额",
      icon: Coins,
      badge: state.ledgerTotal,
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <CreditsAdminHeader state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubNav
          items={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
          variant="pill"
          ariaLabel="积分管理栏目切换"
          layoutId="credits-admin-subnav"
        />
        <span className="text-xs text-muted-foreground">
          {activeTab === "cards"
            ? "集中管理积分兑换卡密生成、状态筛选与批量复制"
            : "查看全平台积分变动流水并直接调整指定用户积分余额"}
        </span>
      </div>
      {activeTab === "cards" ? (
        <CreditCardsSection state={state} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <CreditLedgerSection state={state} />
          <CreditUsersSection state={state} />
        </div>
      )}
      <GenerateCreditCardsDialog state={state} />
      <GeneratedCreditCardsDialog state={state} />
      <DisableCreditCardDialog state={state} />
      <AdjustCreditsDialog state={state} />
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