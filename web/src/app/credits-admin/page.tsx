"use client";

import { LoaderCircle } from "lucide-react";

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
import { useAuthGuard } from "@/lib/use-auth-guard";

function CreditsAdminContent({ session }: { session: NonNullable<ReturnType<typeof useAuthGuard>["session"]> }) {
  const state = useCreditsAdmin(session);

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
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <CreditsAdminContent session={session} />;
}