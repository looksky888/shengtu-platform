"use client";

import { LoaderCircle } from "lucide-react";

import { CopyAssistDialog } from "@/app/credits-admin/copy-assist-dialog";
import { CreditCardsSection } from "@/app/credits-admin/credit-cards-section";
import { CreditLedgerSection } from "@/app/credits-admin/credit-ledger-section";
import { CreditUsersSection } from "@/app/credits-admin/credit-users-section";
import { CreditsAdminHeader } from "@/app/credits-admin/credits-admin-header";
import { DisableCreditCardDialog } from "@/app/credits-admin/disable-credit-card-dialog";
import { GenerateCreditCardsDialog } from "@/app/credits-admin/generate-credit-cards-dialog";
import { GeneratedCreditCardsDialog } from "@/app/credits-admin/generated-credit-cards-dialog";
import { useCreditsAdmin } from "@/app/credits-admin/use-credits-admin";
import { AdjustCreditsDialog } from "@/components/adjust-credits-dialog";
import { useAuthGuard } from "@/lib/use-auth-guard";
import type { StoredAuthSession } from "@/store/auth";

function CreditsAdminContent({ session }: { session: StoredAuthSession }) {
  const state = useCreditsAdmin(session, "all");

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
    <section className="flex flex-col gap-5">
      <CreditsAdminHeader state={state} />
      <CreditCardsSection state={state} />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <CreditLedgerSection state={state} />
        <CreditUsersSection state={state} />
      </div>
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
