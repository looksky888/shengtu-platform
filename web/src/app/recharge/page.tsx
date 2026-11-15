"use client";

import { Cloud, Coins, Layers, LoaderCircle, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  isCloudStorageProduct,
  pickRecommendedProductId,
} from "@/app/recharge/recharge-order-logic";
import { RechargeCheckoutDialog } from "@/app/recharge/recharge-order-status";
import {
  CustomCreditsPanel,
  PaymentChannelSelector,
  PendingOrderTopBanner,
  ProductTile,
  RechargeAccountHeader,
  RechargeErrorPanel,
} from "@/app/recharge/recharge-panels";
import { RechargeRecentOrdersPanel } from "@/app/recharge/recharge-recent-orders";
import { StorageEntitlementPanel } from "@/app/recharge/storage-entitlement-panel";
import { useRechargeOrder } from "@/app/recharge/use-recharge-order";
import { RedeemCodeCard } from "@/components/redeem-code-form";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchProfileCredits } from "@/lib/credit-admin-api";
import { isEscapablePaymentOrderStatus } from "@/lib/payment-order-status";
import { dispatchQuotaRefresh } from "@/lib/quota-events";
import { createRequestId } from "@/lib/request-id";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  createCustomCreditsOrder,
  createPaymentOrder,
  fetchPaymentChannels,
  fetchPaymentConfig,
  fetchRecentPaymentOrders,
  fetchRechargeProducts,
  type PaymentChannelInfo,
  type PaymentConfig,
  type PaymentOrder,
  type RechargeProduct,
} from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

type RechargeFilterTab = "all" | "compute" | "storage";

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
  const [channels, setChannels] = useState<PaymentChannelInfo[]>([]);
  const [recentOrders, setRecentOrders] = useState<PaymentOrder[]>([]);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loadingRecentOrders, setLoadingRecentOrders] = useState(false);
  const [selectedChannelID, setSelectedChannelID] = useState("");
  const [customCredits, setCustomCredits] = useState(100);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const redeemSectionRef = useRef<HTMLDivElement | null>(null);
  const redeemInputRef = useRef<HTMLInputElement | null>(null);
  const submitPending = useRef(false);

  const payment = useRechargeOrder(sessionKey);
  const {
    order,
    error: pollingError,
    querying,
    cancelling,
  } = payment;

  const [checkoutOpen, setCheckoutOpen] = useState<boolean>(() => Boolean(order));
  const lastAutoOpenedOrderIdRef = useRef<string | null>(order?.id ?? null);

  useEffect(() => {
    if (!order) {
      setCheckoutOpen(false);
      lastAutoOpenedOrderIdRef.current = null;
      return;
    }
    if (lastAutoOpenedOrderIdRef.current !== order.id) {
      lastAutoOpenedOrderIdRef.current = order.id;
      setCheckoutOpen(true);
    }
  }, [order]);

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

  const scrollToRedeemInput = useCallback(() => {
    redeemSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => {
      redeemInputRef.current?.focus();
    }, 180);
  }, []);

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
        fetchPaymentChannels().catch(() => ({ items: [] as PaymentChannelInfo[] })),
        fetchRecentPaymentOrders(15).catch(() => ({ items: [] as PaymentOrder[] })),
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
      const result = await fetchRecentPaymentOrders(15);
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
      return [order, ...rest].slice(0, 15);
    });
    if (order.status !== "succeeded") return;
    void loadCreditBalance();
    void fetchPaymentConfig()
      .then((res) => setPaymentConfig(res))
      .catch(() => undefined);
  }, [loadCreditBalance, order]);

  const handleSingleOrderSynced = useCallback(
    (synced: PaymentOrder) => {
      setRecentOrders((current) => {
        const rest = current.filter((item) => item.id !== synced.id);
        return [synced, ...rest].slice(0, 15);
      });
      if (order?.id === synced.id) {
        payment.replaceOrder(synced);
      }
      if (synced.status === "succeeded") {
        dispatchQuotaRefresh();
        void loadCreditBalance();
        void fetchPaymentConfig()
          .then((res) => setPaymentConfig(res))
          .catch(() => undefined);
      }
    },
    [loadCreditBalance, order?.id, payment],
  );

  const visibleProducts = useMemo(() => {
    const allowed = cloudStorageEnabled
      ? products
      : products.filter((item) => !isCloudStorageProduct(item));
    if (activeTab === "storage" && cloudStorageEnabled) {
      return allowed.filter((item) => isCloudStorageProduct(item));
    }
    if (activeTab === "compute") {
      return allowed.filter((item) => !isCloudStorageProduct(item));
    }
    return allowed;
  }, [activeTab, cloudStorageEnabled, products]);

  const recommendedProductId = useMemo(
    () => pickRecommendedProductId(visibleProducts),
    [visibleProducts],
  );

  const baseUnitPriceFen = useMemo(() => {
    if (settings?.credit_unit_price_fen && settings.credit_unit_price_fen > 0) {
      return settings.credit_unit_price_fen;
    }
    let highestUnit = 0;
    for (const item of products) {
      if (!isCloudStorageProduct(item) && item.credits > 0) {
        highestUnit = Math.max(highestUnit, item.amount_fen / item.credits);
      }
    }
    return highestUnit;
  }, [products, settings?.credit_unit_price_fen]);

  const hasStorageProducts = useMemo(
    () =>
      cloudStorageEnabled && products.some((item) => isCloudStorageProduct(item)),
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

  const hasBackgroundPendingOrder = Boolean(
    order &&
      !checkoutOpen &&
      (order.status === "created" ||
        order.status === "pending" ||
        order.status === "closing"),
  );

  const handleCheckoutOpenChange = (nextOpen: boolean) => {
    setCheckoutOpen(nextOpen);
    if (!nextOpen && order && isEscapablePaymentOrderStatus(order.status)) {
      payment.replaceOrder(null);
    }
  };

  const handleSubmit = async (
    product?: RechargeProduct,
    explicitCustomCredits?: number,
  ) => {
    if (submitPending.current || submitting) return;

    // If an active pending order is open or minimized, surface it instead of double-ordering.
    if (order) {
      if (isEscapablePaymentOrderStatus(order.status)) {
        payment.replaceOrder(null);
      } else {
        setCheckoutOpen(true);
        toast.info("您有一笔待支付订单尚未结束，可继续扫码或取消后重选");
        return;
      }
    }

    if (!settings?.recharge_enabled) {
      toast.error("在线充值服务暂未开放，请使用卡密兑换");
      return;
    }

    const creditsToOrder = explicitCustomCredits ?? customCredits;
    if (
      !product &&
      (!settings.custom_credits_enabled ||
        !Number.isSafeInteger(creditsToOrder) ||
        creditsToOrder < settings.min_custom_credits ||
        creditsToOrder > settings.max_custom_credits)
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
        ? await createPaymentOrder(
            product.id,
            idempotencyKey,
            selectedChannelID,
          )
        : await createCustomCreditsOrder(
            creditsToOrder,
            idempotencyKey,
            selectedChannelID,
          );
      lastAutoOpenedOrderIdRef.current = result.item.id;
      payment.replaceOrder(result.item);
      setCheckoutOpen(true);
      toast.success("订单已创建，请使用手机扫码完成支付");
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
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-2">
        <RechargeAccountHeader
          creditBalance={creditBalance}
          cloudStorageEnabled={false}
          entitlement={null}
          onOpenRedeem={scrollToRedeemInput}
        />
        <RechargeErrorPanel
          message={error}
          onRetry={() => void loadRechargeData()}
        />
        <div ref={redeemSectionRef}>
          <RedeemCodeCard
            prominent
            inputRef={redeemInputRef}
            onSuccess={(res) => setCreditBalance(res.balance)}
          />
        </div>
      </section>
    );
  }

  if (!settings?.recharge_enabled) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-2">
        <RechargeAccountHeader
          creditBalance={creditBalance}
          cloudStorageEnabled={cloudStorageEnabled}
          entitlement={entitlement}
          onOpenRedeem={scrollToRedeemInput}
        />

        {/* Prominent Redeem Code Card when Online Payment is Disabled */}
        <div ref={redeemSectionRef}>
          <RedeemCodeCard
            prominent
            inputRef={redeemInputRef}
            onSuccess={(res) => setCreditBalance(res.balance)}
          />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/75 bg-card px-5 py-4 text-sm text-muted-foreground shadow-2xs">
          <WalletCards className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium text-foreground">
              在线扫码充值暂未开放
            </span>
            <span className="ml-1.5">
              当前可直接在上方输入积分卡密完成即时充值，如需获取卡密请联系站点管理员。
            </span>
          </div>
        </div>

        <RechargeRecentOrdersPanel
          orders={recentOrders}
          activeOrderId={order?.id}
          loading={loadingRecentOrders}
          onReload={() => void loadRecentOrders()}
          onResumeOrder={(target) => {
            lastAutoOpenedOrderIdRef.current = target.id;
            payment.replaceOrder(target);
            setCheckoutOpen(true);
          }}
          onOrderSynced={handleSingleOrderSynced}
        />
      </section>
    );
  }

  const activeChannel =
    channels.find((item) => item.id === order?.channel_id) ||
    channels.find((item) => item.id === selectedChannelID);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      {/* Single Refined Account & Entitlement Header */}
      <RechargeAccountHeader
        creditBalance={creditBalance}
        cloudStorageEnabled={cloudStorageEnabled}
        entitlement={entitlement}
        onOpenRedeem={scrollToRedeemInput}
      />

      {/* Minimized Pending Order Banner (when modal closed while pending) */}
      {hasBackgroundPendingOrder && order ? (
        <PendingOrderTopBanner
          order={order}
          cancelling={cancelling}
          onContinue={() => setCheckoutOpen(true)}
          onCancel={() => void payment.cancelAndReset()}
        />
      ) : null}

      {error ? (
        <RechargeErrorPanel
          message={error}
          onRetry={() => void loadRechargeData()}
        />
      ) : null}

      {showEntitlementPanel && entitlement ? (
        <StorageEntitlementPanel entitlement={entitlement} />
      ) : null}

      {/* Brand Payment Selector & Package Category Filter */}
      {channels.length > 0 || hasStorageProducts ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-2xs sm:px-5">
          <PaymentChannelSelector
            channels={channels}
            selectedChannelId={selectedChannelID}
            disabled={submitting}
            onSelect={setSelectedChannelID}
          />

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
                        ? "bg-primary text-primary-foreground shadow-xs"
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

      {/* Package Grid (Stays Smoothly Mounted!) */}
      {visibleProducts.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              baseUnitPriceFen={baseUnitPriceFen}
              recommendedId={recommendedProductId}
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
              ? "可在下方使用自定义积分数量创建扫码订单，或使用卡密兑换积分。"
              : "管理员暂未上架充值套餐，您可使用下方卡密兑换积分或稍后再试。"
          }
        />
      )}

      {/* Custom Credits Input Panel */}
      {settings.custom_credits_enabled && activeTab !== "storage" ? (
        <CustomCreditsPanel
          settings={settings}
          value={customCredits}
          disabled={submitting}
          onChange={setCustomCredits}
          onSubmit={(validCredits) => void handleSubmit(undefined, validCredits)}
        />
      ) : null}

      {/* Built-in Redeem Code Card */}
      <div ref={redeemSectionRef}>
        <RedeemCodeCard
          id="recharge-redeem-card"
          inputRef={redeemInputRef}
          onSuccess={(res) => setCreditBalance(res.balance)}
        />
      </div>

      {/* Enhanced Recent Orders Panel */}
      <RechargeRecentOrdersPanel
        orders={recentOrders}
        activeOrderId={order?.id}
        loading={loadingRecentOrders}
        onReload={() => void loadRecentOrders()}
        onResumeOrder={(target) => {
          lastAutoOpenedOrderIdRef.current = target.id;
          payment.replaceOrder(target);
          setCheckoutOpen(true);
        }}
        onOrderSynced={handleSingleOrderSynced}
      />

      {/* Dedicated QR Checkout Dialog */}
      <RechargeCheckoutDialog
        open={checkoutOpen && Boolean(order)}
        onOpenChange={handleCheckoutOpenChange}
        order={order}
        channelName={activeChannel?.name}
        provider={activeChannel?.provider || "wechatpay"}
        pollingError={pollingError}
        querying={querying}
        cancelling={cancelling}
        onReset={() => {
          setCheckoutOpen(false);
          payment.replaceOrder(null);
        }}
        onRefresh={() => void payment.refresh({ manual: true })}
        onCancel={() => void payment.cancel()}
        onCancelAndReset={() => void payment.cancelAndReset()}
      />
    </section>
  );
}
