import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";

import { formatPaymentAmount } from "@/app/payment-admin/payment-order-presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PaymentReconciliationDetail } from "@/lib/payment-admin-api";

const CATEGORY_LABELS: Record<string, string> = {
  missing_local: "本地漏单",
  missing_bill: "渠道缺单",
  amount_mismatch: "金额不符",
  status_mismatch: "状态不符",
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category || "异常差异";
}

export function PaymentReconciliationDetailDialog({
  detail,
  onClose,
}: {
  detail: PaymentReconciliationDetail | null;
  onClose: () => void;
}) {
  const run = detail?.run;
  const unilateralCount = run
    ? run.missing_local_orders + run.missing_bill_orders
    : 0;
  const mismatchCount = run
    ? run.amount_mismatches + run.status_mismatches
    : 0;

  return (
    <Dialog
      open={detail !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {detail && run ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border/70 bg-surface-muted/35 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                <div className="space-y-1">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Scale className="size-5 text-muted-foreground" />
                    对账明细 ·{" "}
                    <span className="font-mono tabular-nums">
                      {run.bill_date}
                    </span>
                  </DialogTitle>
                  <DialogDescription>
                    {detail.total > 0
                      ? `共发现 ${detail.total} 条账单差异记录，请结合渠道商户后台核实订单状态。`
                      : "渠道账单流水与本地充值订单逐笔核对一致，未发现异常差异。"}
                  </DialogDescription>
                </div>
                <Badge
                  variant={
                    run.status === "succeeded"
                      ? "success"
                      : run.status === "failed"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {run.status === "succeeded"
                    ? "已完成"
                    : run.status === "failed"
                      ? "失败"
                      : "处理中"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-border/75 bg-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-muted-foreground">
                    渠道账单笔数
                  </div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-foreground">
                    {run.bill_rows}
                  </div>
                </div>
                <div className="rounded-xl border border-border/75 bg-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-muted-foreground">
                    核对匹配笔数
                  </div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-status-success">
                    {run.matched_orders}
                  </div>
                </div>
                <div className="rounded-xl border border-border/75 bg-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-muted-foreground">
                    单边账 (漏单/缺单)
                  </div>
                  <div
                    className={`mt-1 text-base font-semibold tabular-nums ${
                      unilateralCount > 0
                        ? "text-status-warning"
                        : "text-foreground"
                    }`}
                  >
                    {unilateralCount}
                  </div>
                </div>
                <div className="rounded-xl border border-border/75 bg-surface px-3.5 py-2.5">
                  <div className="text-[11px] text-muted-foreground">
                    金额/状态不符
                  </div>
                  <div
                    className={`mt-1 text-base font-semibold tabular-nums ${
                      mismatchCount > 0
                        ? "text-status-danger"
                        : "text-foreground"
                    }`}
                  >
                    {mismatchCount}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {run.last_error ? (
                <div className="rounded-xl border border-status-danger/30 bg-status-danger-soft p-3.5 text-sm text-status-danger">
                  <div className="font-medium">对账任务执行错误</div>
                  <p className="mt-1 break-words text-xs leading-relaxed">
                    {run.last_error}
                  </p>
                </div>
              ) : null}

              {detail.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border/75 bg-surface-subtle/50 px-6 py-10 text-center">
                  <CheckCircle2 className="size-8 text-status-success" />
                  <div className="text-sm font-medium text-foreground">
                    账单与本地订单完全一致
                  </div>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    本次对账共核对 {run.bill_rows} 笔渠道交易流水，未发现本地漏单、渠道缺单或实付金额不一致记录。
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-status-warning">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>差异明细（共 {detail.total} 条）</span>
                  </div>
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      className="space-y-2 rounded-xl border border-border/75 bg-surface p-3.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">
                            {getCategoryLabel(item.category)}
                          </Badge>
                          <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                            商户单号：{item.out_trade_no || "—"}
                          </span>
                          {item.transaction_id ? (
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              渠道流水：{item.transaction_id}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                          <span>
                            渠道金额：
                            <strong className="font-semibold text-foreground">
                              {formatPaymentAmount(item.bill_amount_fen)}
                            </strong>
                          </span>
                          <span>
                            本地金额：
                            <strong className="font-semibold text-foreground">
                              {formatPaymentAmount(item.local_amount_fen)}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/70 bg-surface-muted/20 px-6 py-3.5">
              <Button type="button" variant="outline" onClick={onClose}>
                关闭
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
