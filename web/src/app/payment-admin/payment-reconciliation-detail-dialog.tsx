import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PaymentReconciliationDetail } from "@/lib/payment-admin-api";

export function PaymentReconciliationDetailDialog({ detail, onClose }: { detail: PaymentReconciliationDetail | null; onClose: () => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>对账明细</DialogTitle></DialogHeader>
        {detail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {detail.total ? <AlertTriangle className="size-5 text-status-warning" /> : <CheckCircle2 className="size-5 text-status-success" />}
              <span>{detail.total ? `发现 ${detail.total} 条差异` : "账单与本地订单一致"}</span>
            </div>
            {detail.items.map((item) => <div key={item.id} className="rounded-xl border p-3 text-sm">{item.detail}</div>)}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
