import { LoaderCircle } from "lucide-react";

import { PaymentAdminContent } from "@/app/payment-admin/payment-admin-content";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function PaymentAdminPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/payment-admin");
  if (isCheckingAuth || !session)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  return <PaymentAdminContent />;
}
