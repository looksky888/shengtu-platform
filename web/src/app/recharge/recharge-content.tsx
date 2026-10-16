import { useEffect, useRef, useState } from "react";
import { WalletCards } from "lucide-react";
import { toast } from "sonner";

import { RechargeErrorPanel as ErrorPanel } from "@/app/recharge/recharge-panels";
import { RechargeReadyView } from "@/app/recharge/recharge-ready-view";
import {
  createCustomCreditsOrder,
  createPaymentOrder,
  fetchPaymentChannels,
  fetchPaymentSettings,
  fetchRechargeProducts,
  fetchStorageEntitlement,
  type PaymentChannel,
  type PaymentSettings,
  type RechargeProduct,
} from "@/lib/user-admin-api";
import { useRechargeOrder } from "@/app/recharge/use-recharge-order";
import { createRequestId } from "@/lib/request-id";

export function RechargeContent({ sessionKey }: { sessionKey: string }) {
  const [products, setProducts] = useState<RechargeProduct[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [selectedChannelID, setSelectedChannelID] = useState("");
  const [custom, setCustom] = useState(100);
  const payment = useRechargeOrder(sessionKey);
  const { order, querying, cancelling } = payment;
  const submitPending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [storageEntitlement, setStorageEntitlement] = useState<Awaited<ReturnType<typeof fetchStorageEntitlement>>["item"] | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchRechargeProducts(),
      fetchPaymentChannels(),
      fetchPaymentSettings(),
      fetchStorageEntitlement(),
    ])
      .then(([productResult, channelResult, settingsResult, storageResult]) => {
        if (!active) return;
        setProducts(
          Array.isArray(productResult.items) ? productResult.items : [],
        );
        const nextChannels = Array.isArray(channelResult.items)
          ? channelResult.items
          : [];
        setChannels(nextChannels);
        setSelectedChannelID(
          nextChannels.find((item) => item.is_default)?.id ||
            nextChannels[0]?.id ||
            "",
        );
        setSettings(settingsResult.item);
        setStorageEntitlement(storageResult.item);
        setCustom(settingsResult.item.min_custom_credits);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "充值信息加载失败",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (product?: RechargeProduct) => {
    if (submitPending.current || order) return;
    if (!settings?.recharge_enabled) {
      toast.error("充值服务暂未开放");
      return;
    }
    if (
      !product &&
      (!settings.custom_credits_enabled ||
        custom < settings.min_custom_credits ||
        custom > settings.max_custom_credits)
    ) {
      toast.error("自定义积分数量不在允许范围内");
      return;
    }
    submitPending.current = true;
    setSubmitting(true);
    setError("");
    try {
      const key = createRequestId("recharge");
      const result = product
        ? await createPaymentOrder(product.id, key, selectedChannelID)
        : await createCustomCreditsOrder(custom, key, selectedChannelID);
      payment.replaceOrder(result.item);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "创建订单失败");
    } finally {
      submitPending.current = false;
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <main className="mx-auto max-w-6xl p-8 text-muted-foreground">
        正在加载充值中心…
      </main>
    );
  if (error && !settings)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <ErrorPanel message={error} />
      </main>
    );
  if (!settings?.recharge_enabled)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <section className="rounded-3xl border bg-card p-12 text-center shadow-sm">
          <WalletCards className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">充值服务暂未开放</h1>
          <p className="mt-2 text-muted-foreground">
            请稍后再试，或联系管理员。
          </p>
        </section>
      </main>
    );

  return <RechargeReadyView products={products} channels={channels} settings={settings} storageEntitlement={storageEntitlement} selectedChannelID={selectedChannelID} custom={custom} order={order} submitting={submitting} querying={querying} cancelling={cancelling} error={error || payment.error} onChannelChange={setSelectedChannelID} onCustomChange={setCustom} onSubmit={(product) => void submit(product)} onCancel={() => void payment.cancel()} onReset={() => payment.replaceOrder(null)} onRefresh={() => void payment.refresh()} />;
}
