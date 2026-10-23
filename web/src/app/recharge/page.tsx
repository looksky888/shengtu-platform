import { LoaderCircle } from "lucide-react";

import { RechargeContent } from "@/app/recharge/recharge-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function RechargePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/recharge");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <RechargeContent
      sessionKey={session.key}
      isAdmin={session.role === "admin"}
    />
  );
}
