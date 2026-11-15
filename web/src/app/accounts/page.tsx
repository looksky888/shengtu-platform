"use client";

import { LoaderCircle } from "lucide-react";

import { AccountsPageContent } from "@/app/accounts/accounts-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function AccountsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/accounts");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <AccountsPageContent session={session} />;
}
