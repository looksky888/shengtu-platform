import { useEffect, useState } from "react";
import { LoaderCircle, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAdminPaymentReconciliation,
  fetchAdminPaymentReconciliations,
  triggerAdminPaymentReconciliation,
  type PaymentChannel,
  type PaymentReconciliationDetail,
  type PaymentReconciliationRun,
} from "@/lib/payment-admin-api";
import { Badge } from "@/components/ui/badge";
import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import { PaymentReconciliationDetailDialog } from "@/app/payment-admin/payment-reconciliation-detail-dialog";

function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}
export function PaymentReconciliationsSection({
  channels,
}: {
  channels: PaymentChannel[];
}) {
  const [channelId, setChannelId] = useState("");
  const [billDate, setBillDate] = useState(yesterday());
  const [items, setItems] = useState<PaymentReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [selected, setSelected] = useState<PaymentReconciliationDetail | null>(
    null,
  );
  const channel = channels.find((item) => item.id === channelId);
  const supported = channel?.provider === "wechatpay";
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setItems(
        (await fetchAdminPaymentReconciliations({ page: 1, page_size: 50 }))
          .items,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "加载对账记录失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channelId, channels]);
  const trigger = async () => {
    if (!supported || triggering) return;
    setTriggering(true);
    try {
      await triggerAdminPaymentReconciliation(channelId, billDate);
      toast.success("对账任务已提交");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setTriggering(false);
    }
  };
  return (
    <>
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>账单对账</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="选择渠道" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ·{" "}
                    {item.provider === "alipay" ? "支付宝" : "微信"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={billDate}
              max={yesterday()}
              onChange={(e) => setBillDate(e.target.value)}
            />
            <Button disabled={!supported || triggering} onClick={() => void trigger()}>
              {triggering ? <LoaderCircle className="size-4 animate-spin" /> : null}
              <Scale className="size-4" />
              {triggering ? "提交中" : "手动对账"}
            </Button>
          </div>
          {channel && !supported ? (
            <div className="rounded-xl border border-status-warning/30 bg-status-warning-soft p-3 text-sm text-status-warning">
              当前为支付宝渠道，账单下载对账入口已关闭；支付和主动查单不受影响。
            </div>
          ) : null}
          {loading ? (
            <PaymentSectionState mode="loading" title="正在加载对账记录" />
          ) : loadError ? (
            <PaymentSectionState mode="error" title="对账记录加载失败" detail={loadError} onRetry={() => void load()} />
          ) : items.length === 0 ? (
            <PaymentSectionState mode="empty" icon={Scale} title="暂无对账记录" detail="可选择微信支付渠道与账单日期，点击「手动对账」拉取账单核对。" />
          ) : (
            <div className="grid gap-2">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() =>
                    void fetchAdminPaymentReconciliation(item.id, {
                      page: 1,
                      page_size: 100,
                    })
                      .then(setSelected)
                      .catch((e: unknown) =>
                        toast.error(
                          e instanceof Error ? e.message : "加载明细失败",
                        ),
                      )
                  }
                  className="grid gap-2 rounded-xl border border-border/70 bg-card p-3 text-left text-sm transition-colors hover:bg-surface-hover/60 md:grid-cols-[120px_1fr_auto]"
                >
                  <strong className="tabular-nums">{item.bill_date}</strong>
                  <span>
                    {channels.find((entry) => entry.id === item.channel_id)
                      ?.name || item.channel_id}
                  </span>
                  <Badge
                    variant={
                      item.status === "succeeded"
                        ? "success"
                        : item.status === "failed"
                          ? "danger"
                          : "secondary"
                    }
                  >
                    {item.status === "succeeded"
                      ? "已完成"
                      : item.status === "failed"
                        ? "失败"
                        : "处理中"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <PaymentReconciliationDetailDialog detail={selected} onClose={() => setSelected(null)} />
    </>
  );
}
