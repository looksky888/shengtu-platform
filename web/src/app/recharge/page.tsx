import { useAuthGuard } from "@/lib/use-auth-guard";
import { RechargeContent } from "@/app/recharge/recharge-content";

export default function RechargePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/recharge");
  if (isCheckingAuth || !session) return null;
  return <RechargeContent sessionKey={session.key} />;
}
