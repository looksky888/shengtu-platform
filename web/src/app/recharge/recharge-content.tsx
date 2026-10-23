import { ArrowUpRight, LoaderCircle, Ticket, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  RechargeErrorPanel as ErrorPanel,
  RechargeHeaderActions,
} from "@/app/recharge/recharge-panels";
import { RechargeReadyView } from "@/app/recharge/recharge-ready-view";
import { useRechargeOrder } from "@/app/recharge/use-recharge-order";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchProfileCredits } from "@/lib/api";
import { createRequestId } from "@/lib/request-id";
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

export function RechargeContent({
  sessionKey,
  isAdmin = false,
}: {
  sessionKey: string;
  isAdmin?: boolean;
}) {
  const [products, setProducts] = useState<RechargeProduct[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [selectedChannelID, setSelectedChannelID] = useState("");
  const [custom, setCustom] = useState(100);
  const payment = useRechargeOrder(sessionKey);
  const { order, querying, cancelling } = payment;
  const submitPending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [storageEntitlement, setStorageEntitlement] = useState<
    Awaited<ReturnType<typeof fetchStorageEntitlement>>["item"] | null
  >(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchRechargeProducts(),
      fetchPaymentChannels(),
      fetchPaymentSettings(),
      fetchStorageEntitlement(),
      fetchProfileCredits().catch(() => null),
    ])
      .then(
        ([
          productResult,
          channelResult,
          settingsResult,
          storageResult,
          creditsResult,
        ]) => {
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
          if (creditsResult && typeof creditsResult.balance === "number") {
            setCreditBalance(creditsResult.balance);
          }
          setCustom(settingsResult.item.min_custom_credits);
        },
      )
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

  useEffect(() => {
    if (order?.status !== "succeeded") return;
    let active = true;
    void Promise.all([
      fetchProfileCredits().catch(() => null),
      fetchStorageEntitlement().catch(() => null),
    ]).then(([creditsResult, storageResult]) => {
      if (!active) return;
      if (creditsResult && typeof creditsResult.balance === "number") {
        setCreditBalance(creditsResult.balance);
      }
      if (storageResult?.item) {
        setStorageEntitlement(storageResult.item);
      }
    });
    return () => {
      active = false;
    };
  }, [order?.id, order?.status]);

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

  const headerActions = <RechargeHeaderActions creditBalance={creditBalance} />;

  if (loading)
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeader
          eyebrow="算力与存储"
          title="充值中心"
          description="购买积分或云存储套餐，使用微信或支付宝扫码支付，到账后权益自动更新。"
          actions={headerActions}
        />
        <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-border/75 bg-card p-8 text-center text-sm text-muted-foreground shadow-2xs">
          <LoaderCircle className="size-4 animate-spin" />
          正在加载充值中心…
        </div>
      </section>
    );
  if (error && !settings)
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeader
          eyebrow="算力与存储"
          title="充值中心"
          description="购买积分或云存储套餐，使用微信或支付宝扫码支付，到账后权益自动更新。"
          actions={headerActions}
        />
        <ErrorPanel message={error} />
      </section>
    );
  if (!settings?.recharge_enabled)
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeader
          eyebrow="算力与存储"
          title="充值中心"
          description="购买积分或云存储套餐，使用微信或支付宝扫码支付，到账后权益自动更新。"
          actions={headerActions}
        />
        <EmptyState
          icon={WalletCards}
          title="充值服务暂未开放"
          description="在线扫码充值暂未开启，你仍可前往个人中心使用充值卡密核销积分，或完成每日签到领取奖励。"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/profile?tab=credits">
                  <Ticket className="size-3.5" />
                  使用兑换码核销积分
                </Link>
              </Button>
              {isAdmin ? (
                <Button size="sm" asChild>
                  <Link to="/payment-admin?tab=settings">
                    前往支付管理开启充值
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />
      </section>
    );

  return (
    <RechargeReadyView
      products={products}
      channels={channels}
      settings={settings}
      storageEntitlement={storageEntitlement}
      creditBalance={creditBalance}
      isAdmin={isAdmin}
      selectedChannelID={selectedChannelID}
      custom={custom}
      order={order}
      submitting={submitting}
      querying={querying}
      cancelling={cancelling}
      error={error || payment.error}
      onChannelChange={setSelectedChannelID}
      onCustomChange={setCustom}
      onSubmit={(product) => void submit(product)}
      onCancel={() => void payment.cancel()}
      onReset={() => payment.replaceOrder(null)}
      onRefresh={() => void payment.refresh()}
    />
  );
}
