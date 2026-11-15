"use client";

import { Cloud, Coins, Layers, LoaderCircle, Sparkles, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { RechargeOrderStatus } from "@/app/recharge/recharge-order-status";
import {
  CustomCreditsPanel,
  ProductTile,
  RechargeErrorPanel,
  RechargeHeaderActions,
} from "@/app/recharge/recharge-panels";
import { RechargeRecentOrdersPanel } from "@/app/recharge/recharge-recent-orders";
import { StorageEntitlementPanel } from "@/app/recharge/storage-entitlement-panel";
import { useRechargeOrder } from "@/app/recharge/use-recharge-order";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import webConfig from "@/constants/common-env";
import { fetchProfileCredits } from "@/lib/credit-admin-api";
import {
  cancelPaymentOnLeave,
  shouldWarnBeforeLeavingPendingOrder,
} from "@/lib/payment-order-leave";
import { createRequestId } from "@/lib/request-id";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { useUnsavedRouteGuard } from "@/lib/use-unsaved-route-guard";
import {
  createCustomCreditsOrder,
  createPaymentOrder,
  fetchPaymentChannels,
  fetchPaymentConfig,
  fetchRecentPaymentOrders,
  fetchRechargeProducts,
  type PaymentChannel,
  type PaymentConfig,
  type PaymentOrder,
  type RechargeProduct,
} from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

type RechargeFilterTab = "all" | "compute" | "storage";

function isStorageProduct(product: RechargeProduct): boolean {
  return (
    product.product_type === "cloud_storage" ||
    product.product_type === "storage"
  );
}

function formatChannelLabel(channel: PaymentChannel): string {
  const customName = channel.name?.trim();
  if (customName) return customName;
  if (channel.provider === "alipay") return "支付宝扫码";
  if (channel.provider === "wechatpay") return "微信支付扫码";
  return "在线扫码支付";
}

export default function RechargePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/recharge");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <RechargeContent sessionKey={session.key} />;
}

function RechargeContent({ sessionKey }: { sessionKey: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [products, setProducts] = useState<RechargeProduct[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [recentOrders, setRecentOrders] = useState<PaymentOrder[]>([]);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingRecentOrders, setLoadingRecentOrders] = useState(false);
  const [selectedChannelID, setSelectedChannelID] = useState("");
  const [customCredits, setCustomCredits] = useState(100);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const payment = useRechargeOrder(sessionKey);
  const { order, querying, cancelling } = payment;
  const submitPending = useRef(false);

  const cloudStorageEnabled = Boolean(paymentConfig?.cloud_storage_enabled);
  const settings = paymentConfig?.settings ?? null;
  const entitlement = paymentConfig?.storage_entitlement ?? null;

  const rawTab = searchParams.get("tab");
  const activeTab: RechargeFilterTab =
    rawTab === "storage" && cloudStorageEnabled
      ? "storage"
      : rawTab === "compute"
        ? "compute"
        : "all";

  const setActiveTab = (next: RechargeFilterTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true });
  };

  const hasPendingPaymentOrder = shouldWarnBeforeLeavingPendingOrder(order);
  const leaveGuard = useUnsavedRouteGuard({
    when: hasPendingPaymentOrder,
    onSave: () => true,
    onDiscard: async () => {
      if (!order) return true;
      try {
        await cancelPaymentOnLeave(webConfig.apiUrl, sessionKey, order.id);
        payment.replaceOrder(null);
        toast.success("未支付订单已取消");
      } catch (reason) {
        toast.warning(
          reason instanceof Error
            ? reason.message
            : "离开页面时关单未确认，请稍后返回查询",
        );
      }
      return true;
    },
  });

  const loadCreditBalance = useCallback(async () => {
    try {
      const res = await fetchProfileCredits();
      if (typeof res?.balance === "number") {
        setCreditBalance(res.balance);
      }
    } catch {
      // Non-blocking header balance
    }
  }, []);

  const loadRechargeData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configRes, productsRes, channelsRes, recentRes] = await Promise.all([
        fetchPaymentConfig(),
        fetchRechargeProducts().catch(() => ({ items: [] as RechargeProduct[] })),
        fetchPaymentChannels().catch(() => ({ items: [] as PaymentChannel[] })),
        fetchRecentPaymentOrders(10).catch(() => ({ items: [] as PaymentOrder[] })),
      ]);
      setPaymentConfig(configRes);
      setProducts(Array.isArray(productsRes.items) ? productsRes.items : []);
      const nextChannels = Array.isArray(channelsRes.items)
        ? channelsRes.items
        : [];
      setChannels(nextChannels);
      setSelectedChannelID((prev) =>
        prev && nextChannels.some((item) => item.id === prev)
          ? prev
          : nextChannels.find((item) => item.is_default)?.id ||
            nextChannels[0]?.id ||
            "",
      );
      setRecentOrders(Array.isArray(recentRes.items) ? recentRes.items : []);
      if (configRes.settings?.min_custom_credits > 0) {
        setCustomCredits((current) =>
          current >= configRes.settings.min_custom_credits &&
          current <= configRes.settings.max_custom_credits
            ? current
            : configRes.settings.min_custom_credits,
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "充值信息加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentOrders = useCallback(async () => {
    setLoadingRecentOrders(true);
    try {
      const result = await fetchRecentPaymentOrders(10);
      setRecentOrders(Array.isArray(result.items) ? result.items : []);
    } catch {
      // Keep page interactive when transient refresh fails
    } finally {
      setLoadingRecentOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadRechargeData();
    void loadCreditBalance();
  }, [loadCreditBalance, loadRechargeData]);

  useEffect(() => {
    if (!order) return;
    setRecentOrders((current) => {
      const rest = current.filter((item) => item.id !== order.id);
      return [order, ...rest].slice(0, 10);
    });
    if (order.status !== "succeeded") return;
    void loadCreditBalance();
    void fetchPaymentConfig()
      .then((res) => setPaymentConfig(res))
      .catch(() => undefined);
  }, [loadCreditBalance, order]);

  const visibleProducts = useMemo(() => {
    const allowed = cloudStorageEnabled
      ? products
      : products.filter((item) => !isStorageProduct(item));
    if (activeTab === "storage" && cloudStorageEnabled) {
      return allowed.filter((item) => isStorageProduct(item));
    }
    if (activeTab === "compute") {
      return allowed.filter((item) => !isStorageProduct(item));
    }
    return allowed;
  }, [activeTab, cloudStorageEnabled, products]);

  const hasStorageProducts = useMemo(
    () => cloudStorageEnabled && products.some((item) => isStorageProduct(item)),
    [cloudStorageEnabled, products],
  );

  const showEntitlementPanel = Boolean(
    cloudStorageEnabled &&
      entitlement &&
      (entitlement.unlimited ||
        entitlement.storage_bytes > 0 ||
        entitlement.tier === "active" ||
        entitlement.tier === "grace"),
  );

  const handleSubmit = async (product?: RechargeProduct) => {
    if (submitPending.current || submitting || order) return;
    if (!settings?.recharge_enabled) {
      toast.error("充值服务暂未开放");
      return;
    }
    if (
      !product &&
      (!settings.custom_credits_enabled ||
        customCredits < settings.min_custom_credits ||
        customCredits > settings.max_custom_credits)
    ) {
      toast.error("自定义积分数量不在允许范围内");
      return;
    }
    submitPending.current = true;
    setSubmitting(true);
    setError("");
    try {
      const idempotencyKey = createRequestId("recharge");
      const result = product
        ? await createPaymentOrder(product.id, idempotencyKey, selectedChannelID)
        : await createCustomCreditsOrder(
            customCredits,
            idempotencyKey,
            selectedChannelID,
          );
      payment.replaceOrder(result.item);
      toast.success("订单已创建，请使用二维码扫码支付");
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "创建订单失败";
      setError(message);
      toast.error(message);
    } finally {
      submitPending.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        正在加载充值中心…
      </div>
    );
  }

  if (error && !settings) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-4">
        <PageHeader
          eyebrow="充值中心"
          title="在线充值"
          actions={<RechargeHeaderActions creditBalance={creditBalance} />}
        />
        <RechargeErrorPanel message={error} />
      </section>
    );
  }

  if (!settings?.recharge_enabled) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-4">
        <PageHeader
          eyebrow="充值中心"
          title="在线充值"
          actions={<RechargeHeaderActions creditBalance={creditBalance} />}
        />
        <div className="rounded-[24px] border border-border bg-card p-12 text-center shadow-sm">
          <WalletCards className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="text-2xl font-semibold text-foreground">
            充值服务暂未开放
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            当前可使用卡密在个人中心兑换积分，或稍后再试。
          </p>
        </div>
      </section>
    );
  }

  const activeChannel =
    channels.find((item) => item.id === order?.channel_id) ||
    channels.find((item) => item.id === selectedChannelID);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="充值中心"
        title={cloudStorageEnabled ? "积分与云存储充值" : "算力积分充值"}
        actions={<RechargeHeaderActions creditBalance={creditBalance} />}
      />

      <header className="rounded-[24px] bg-gradient-to-br from-[#1456f0] via-blue-600 to-indigo-600 p-6 text-white shadow-[0_12px_32px_rgba(20,86,240,0.18)] sm:p-8">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-5" />
          <span className="text-xs font-semibold tracking-[0.14em] uppercase opacity-85">
            PAYMENT CENTER
          </span>
        </div>
        <h2 className="mt-2.5 text-2xl font-semibold sm:text-3xl">充值中心</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-blue-100">
          {cloudStorageEnabled
            ? "选购算力积分套餐或云存储 VIP 权益，使用微信或支付宝扫码支付，完成后实时自动到账。"
            : "选购算力积分套餐或按需自定义充值，使用微信或支付宝扫码支付，完成后积分实时自动到账。"}
        </p>
      </header>

      {error ? <RechargeErrorPanel message={error} /> : null}

      {showEntitlementPanel && entitlement ? (
        <StorageEntitlementPanel entitlement={entitlement} />
      ) : null}

      {!order && (channels.length > 0 || hasStorageProducts) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-card p-3.5 shadow-2xs">
          {channels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-1 text-xs font-medium text-muted-foreground">
                支付方式
              </span>
              {channels.map((channel) => (
                <Button
                  key={channel.id}
                  type="button"
                  size="sm"
                  variant={selectedChannelID === channel.id ? "default" : "outline"}
                  className={cn(
                    "rounded-full",
                    selectedChannelID === channel.id &&
                      "bg-[#1456f0] text-white hover:bg-[#1048ce]",
                  )}
                  onClick={() => setSelectedChannelID(channel.id)}
                  disabled={submitting}
                >
                  {formatChannelLabel(channel)}
                </Button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {hasStorageProducts ? (
            <div
              role="tablist"
              aria-label="套餐类型筛选"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1"
            >
              {(
                [
                  { key: "all", label: "全部套餐", icon: Layers },
                  { key: "compute", label: "算力积分", icon: Coins },
                  { key: "storage", label: "云存储 VIP", icon: Cloud },
                ] as const
              ).map((item) => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(item.key)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                      active
                        ? "bg-[#1456f0] text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {!order ? (
        <>
          {visibleProducts.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  disabled={submitting}
                  onSubmit={(target) => void handleSubmit(target)}
                />
              ))}
            </section>
          ) : (
            <EmptyState
              icon={WalletCards}
              title="暂无可用充值套餐"
              description={
                settings.custom_credits_enabled
                  ? "可在下方使用自定义积分数量创建扫码订单。"
                  : "管理员暂未上架充值套餐，请稍后再试。"
              }
            />
          )}

          {settings.custom_credits_enabled && activeTab !== "storage" ? (
            <CustomCreditsPanel
              settings={settings}
              value={customCredits}
              disabled={submitting}
              onChange={setCustomCredits}
              onSubmit={() => void handleSubmit()}
            />
          ) : null}
        </>
      ) : (
        <RechargeOrderStatus
          order={order}
          channelName={activeChannel?.name}
          provider={activeChannel?.provider || "wechatpay"}
          querying={querying}
          cancelling={cancelling}
          onReset={() => payment.replaceOrder(null)}
          onRefresh={() => void payment.refresh({ manual: true })}
          onCancel={() => void payment.cancel()}
        />
      )}

      <RechargeRecentOrdersPanel
        orders={recentOrders}
        activeOrderId={order?.id}
        loading={loadingRecentOrders}
        onReload={() => void loadRecentOrders()}
        onResumeOrder={(target) => payment.replaceOrder(target)}
      />

      <ConfirmDialog
        open={leaveGuard.isOpen}
        tone="warning"
        title="当前有待支付扫码订单"
        description="离开当前页面可以选择保留订单稍后继续支付，或直接取消当前未支付订单。"
        confirmLabel="保留订单并离开"
        cancelLabel="留在此页"
        pending={leaveGuard.isSaving}
        secondaryAction={{
          label: "取消订单并离开",
          variant: "destructive",
          pending: leaveGuard.isDiscarding,
          onClick: () => void leaveGuard.confirmDiscardAndLeave(),
        }}
        onClose={leaveGuard.cancelLeave}
        onConfirm={() => void leaveGuard.confirmSaveAndLeave()}
      />
    </section>
  );
}
