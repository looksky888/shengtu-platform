import { Badge } from "@/components/ui/badge";
import {
  paymentOrderStatusLabel,
  paymentOrderStatusVariant,
} from "@/lib/payment-order-status";

export function StatusBadge({ status }: { status: string }) {
  const dot =
    status === "succeeded"
      ? "bg-status-success"
      : status === "failed" || status === "exception"
        ? "bg-status-danger"
        : "bg-current/50";
  return (
    <Badge
      variant={paymentOrderStatusVariant(status)}
      className="gap-1.5 rounded-md"
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {paymentOrderStatusLabel(status)}
    </Badge>
  );
}
