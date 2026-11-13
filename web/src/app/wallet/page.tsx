"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Coins,
  History,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ProfileCreditLedgerTable } from "@/app/profile/profile-credit-ledger-table";
import { ProfileInviteRedeemCard } from "@/app/profile/profile-invite-redeem-card";
import { formatCreditNumber } from "@/app/profile/profile-utils";
import { useProfileCredits } from "@/app/profile/use-profile-credits";
import { useProfileInvite } from "@/app/profile/use-profile-invite";
import { RechargeOrderStatus } from "@/app/recharge/recharge-order-status";
import {
  CustomCreditsPanel,
  ProductTile,
  RechargeErrorPanel,
} from "@/app/recharge/recharge-panels";
import { RechargeRecentOrdersPanel } from "@/app/recharge/recharge-recent-orders";
import { StorageEntitlementPanel } from "@/app/recharge/storage-entitlement-panel";
import { useRechargeOrder } from "@/app/recharge/use-recharge-order";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SubNav, type SubNavItem } from "@/components/ui/sub-nav";
import webConfig from "@/constants/common-env";
import { copyText } from "@/lib/clipboard";
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

export type WalletTab = "compute" | "storage" | "redeem" | "ledger";

function isStorageProduct(product: RechargeProduct): boolean {
  return (
    product.product_type === "cloud_storage" ||
    product.product_type === "storage"
  );
}

function formatChannelLabel(channel: PaymentChannel): string {
  const customName = channel.name?.trim();
  if (customName) {
    return customName;
  }
  if (channel.provider === "alipay") {
    return "支付宝扫码";
  }
  if (channel.provider === "wechatpay") {
    return "微信支付扫码";
  }
  return "在线扫码支付";
}

function resolveWalletTab(
  raw: string | null,
  cloudStorageEnabled: boolean,
  rechargeEnabled: boolean | null,
): WalletTab {
  if (raw === "redeem") return "redeem";
  if (raw === "ledger") return "ledger";
  if (raw === "storage" && cloudStorageEnabled) return "storage";
  if (raw === "compute") return "compute";
  if (rechargeEnabled === false) return "redeem";
  return "compute";
}

export default function WalletPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/wallet");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <WalletContent
      sessionKey={session.key}
      isAdmin={session.role === "admin"}
    />
  );
}

function WalletContent({
  sessionKey,
  isAdmin,
}: {
  sessionKey: string;
  isAdmin: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [products, setProducts] = useState<RechargeProduct[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [recentOrders, setRecentOrders] = useState<PaymentOrder[]>([]);
  const [loadingRecentOrders, setLoadingRecentOrders] = useState(false);
  const [selectedChannelID, setSelectedChannelID] = useState("");
  const [customCredits, setCustomCredits] = useState(100);
  const [loadingPayment, setLoadingPayment] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const credits = useProfileCredits();
  const invite = useProfileInvite();
  const payment = useRechargeOrder(sessionKey);
  const { order, querying, cancelling } = payment;
  const submitPending = useRef(false);

  const cloudStorageEnabled = Boolean(paymentConfig?.cloud_storage_enabled);
  const settings = paymentConfig?.settings ?? null;
  const rechargeEnabled = settings ? Boolean(settings.recharge_enabled) : null;
  const entitlement = paymentConfig?.storage_entitlement ?? null;
  const freeRetentionDays = paymentConfig?.free_retention_days ?? 3;
  const vipGraceDays = paymentConfig?.vip_grace_days ?? 7;

  const activeTab = resolveWalletTab(
    searchParams.get("tab"),
    cloudStorageEnabled,
    rechargeEnabled,
  );

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

  const loadPaymentData = useCallback(async (notifyOnError = false) => {
    setLoadingPayment(true);
    setPaymentError("");
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
      const message =
        reason instanceof Error ? reason.message : "权益与充值配置加载失败";
      setPaymentError(message);
      if (notifyOnError) {
        toast.error(message);
      }
    } finally {
      setLoadingPayment(false);
    }
  }, []);

  const loadRecentOrders = useCallback(async () => {
    setLoadingRecentOrders(true);
    try {
      const result = await fetchRecentPaymentOrders(10);
      setRecentOrders(Array.isArray(result.items) ? result.items : []);
    } catch {
      // Keep wallet interactive when order history refresh fails transiently.
    } finally {
      setLoadingRecentOrders(false);
    }
  }, []);

  const { loadCredits } = credits;
  const { loadInvite } = invite;

  useEffect(() => {
    void loadPaymentData(false);
    void loadCredits(false);
    void loadInvite(false);
  }, [loadCredits, loadInvite, loadPaymentData]);

  useEffect(() => {
    if (!order) return;
    setRecentOrders((current) => {
      const rest = current.filter((item) => item.id !== order.id);
      return [order, ...rest].slice(0, 10);
    });
    if (order.status !== "succeeded") return;
    void loadCredits(false);
    void fetchPaymentConfig()
      .then((nextConfig) => setPaymentConfig(nextConfig))
      .catch(() => undefined);
  }, [loadCredits, order]);

  const handleTabChange = (next: WalletTab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  const handleRefreshAll = () => {
    void loadPaymentData(true);
    void credits.loadCredits(true);
    void invite.loadInvite(false);
  };

  const handleCopy = async (value: string) => {
    try {
      await copyText(value);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const submitOrder = async (product?: RechargeProduct) => {
    if (submitPending.current || order) return;
    if (!settings?.recharge_enabled) {
      toast.error("扫码支付服务暂未开放，请使用卡密核销");
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
    setSubmittingOrder(true);
    setPaymentError("");
    try {
      const key = createRequestId("wallet");
      const result = product
        ? await createPaymentOrder(product.id, key, selectedChannelID)
        : await createCustomCreditsOrder(
            customCredits,
            key,
            selectedChannelID,
          );
      payment.replaceOrder(result.item);
    } catch (reason) {
      setPaymentError(
        reason instanceof Error ? reason.message : "创建支付订单失败",
      );
    } finally {
      submitPending.current = false;
      setSubmittingOrder(false);
    }
  };

  const computeProducts = useMemo(
    () => products.filter((item) => !isStorageProduct(item)),
    [products],
  );
  const storageProducts = useMemo(
    () => products.filter((item) => isStorageProduct(item)),
    [products],
  );

  const walletTabs = useMemo<SubNavItem<WalletTab>[]>(() => {
    const items: SubNavItem<WalletTab>[] = [
      {
        value: "compute",
        label: "算力充值",
        icon: Coins,
      },
    ];
    if (cloudStorageEnabled) {
      items.push({
        value: "storage",
        label: "云存储会员",
        icon: Cloud,
        badge:
          entitlement?.tier === "active"
            ? "VIP"
            : entitlement?.tier === "grace"
              ? "宽限期"
              : undefined,
      });
    }
    items.push(
      {
        value: "redeem",
        label: "卡密核销",
        icon: KeyRound,
      },
      {
        value: "ledger",
        label: "积分流水",
        icon: History,
        badge:
          credits.sortedCreditLedgerLength > 0
            ? credits.sortedCreditLedgerLength
            : undefined,
      },
    );
    return items;
  }, [
    cloudStorageEnabled,
    credits.sortedCreditLedgerLength,
    entitlement?.tier,
  ]);

  const checkedInToday = Boolean(credits.credits?.checked_in_today);
  const formattedBalance =
    typeof credits.credits?.balance === "number" &&
    Number.isFinite(credits.credits.balance)
      ? formatCreditNumber(credits.credits.balance)
      : "—";
  const isRefreshing =
    loadingPayment || credits.isLoadingCredits || invite.isLoadingInvite;
  const combinedError = paymentError || payment.error;

  const channelSelector =
    !order && channels.length > 0 ? (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 dark:border-white/[0.08] dark:bg-[#17181c]">
        <span className="text-xs font-semibold text-foreground">
          选择扫码支付通道
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {channels.map((channel) => {
            const active = selectedChannelID === channel.id;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => setSelectedChannelID(channel.id)}
                disabled={submittingOrder}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                  active
                    ? "border-foreground bg-foreground text-background shadow-2xs"
                    : "border-border/75 bg-surface-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    active ? "bg-background" : "bg-border-strong",
                  )}
                />
                {formatChannelLabel(channel)}
              </button>
            );
          })}
        </div>
      </section>
    ) : null;

  const activeOrderPanel = order ? (
    <RechargeOrderStatus
      order={order}
      channelName={
        channels.find((item) => item.id === order.channel_id)?.name ||
        channels.find((item) => item.id === selectedChannelID)?.name
      }
      provider={
        channels.find((item) => item.id === order.channel_id)?.provider ||
        channels.find((item) => item.id === selectedChannelID)?.provider ||
        "wechatpay"
      }
      querying={querying}
      cancelling={cancelling}
      onCancel={() => void payment.cancel()}
      onReset={() => payment.replaceOrder(null)}
      onRefresh={() => void payment.refresh({ manual: true })}
    />
  ) : null;

  return (
    <section className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 pb-6">
      {/* Header */}
      <header className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 dark:border-white/[0.08] dark:bg-[#17181c] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-amber-500 dark:text-amber-300" />
            <span>算力账户与会员权益</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            积分与权益中心
          </h1>
          <p className="text-xs text-muted-foreground sm:text-[13px]">
            统一管理创作算力充值、卡密兑换、每日签到奖励与账户收支明细。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 text-xs font-medium text-amber-700 tabular-nums dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            <Coins className="size-3.5 shrink-0" />
            <span>当前可用算力:</span>
            <strong className="font-semibold">{formattedBalance} 积分</strong>
          </div>

          <Button
            type="button"
            size="sm"
            variant={checkedInToday ? "outline" : "default"}
            className="h-9 rounded-full px-3.5"
            disabled={
              credits.isLoadingCredits || credits.isCheckingIn || checkedInToday
            }
            onClick={() => void credits.handleCheckin()}
          >
            {credits.isCheckingIn ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : checkedInToday ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : (
              <Coins className="size-3.5" />
            )}
            <span>{checkedInToday ? "今日已签到" : "签到领积分"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-9 rounded-full"
            disabled={isRefreshing}
            onClick={handleRefreshAll}
            aria-label="刷新钱包与权益数据"
            title="刷新钱包与权益数据"
          >
            <RefreshCw
              className={cn("size-3.5", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
      </header>

      {/* Secondary Underline Tabs */}
      <SubNav
        items={walletTabs}
        value={activeTab}
        onValueChange={handleTabChange}
        variant="underline"
        layoutId="wallet-main-subnav"
        ariaLabel="积分与权益分区导航"
      />

      {combinedError && (activeTab === "compute" || activeTab === "storage") ? (
        <RechargeErrorPanel message={combinedError} />
      ) : null}

      {/* Tab 1: Compute Recharge */}
      {activeTab === "compute" ? (
        loadingPayment ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-border/70 bg-card p-8 text-sm text-muted-foreground dark:border-white/[0.08] dark:bg-[#17181c]">
            <LoaderCircle className="size-4 animate-spin" />
            <span>正在同步充值套餐与支付通道…</span>
          </div>
        ) : !settings?.recharge_enabled ? (
          <EmptyState
            icon={WalletCards}
            title="扫码充值暂未开放"
            description="当前站点暂未开启在线扫码充值，你可直接前往「卡密核销」输入兑换码补充算力，或通过右上角每日签到领取积分。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleTabChange("redeem")}
                >
                  <Ticket className="size-3.5" />
                  前往卡密核销
                </Button>
                {isAdmin ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin/payments?tab=settings">
                      前往后台开启充值
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {channelSelector}
            {activeOrderPanel ? (
              activeOrderPanel
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {computeProducts.length > 0 ? (
                    computeProducts.map((product) => (
                      <ProductTile
                        key={product.id}
                        product={product}
                        disabled={submittingOrder}
                        onSubmit={(item) => void submitOrder(item)}
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon={PackageOpen}
                      title="暂无固定算力套餐"
                      description={
                        settings.custom_credits_enabled
                          ? "当前未上架固定面额套餐，你可直接使用下方自定义积分充值，或切换至「卡密核销」兑换积分。"
                          : "当前暂未上架算力充值套餐，你可切换至「卡密核销」使用兑换码充值。"
                      }
                      action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleTabChange("redeem")}
                          >
                            <Ticket className="size-3.5" />
                            使用卡密核销
                          </Button>
                          {isAdmin ? (
                            <Button size="sm" asChild>
                              <Link to="/admin/payments?tab=products">
                                前往支付管理上架套餐
                                <ArrowUpRight className="size-3.5" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      }
                      className="md:col-span-2 lg:col-span-3"
                    />
                  )}
                </section>

                {settings.custom_credits_enabled ? (
                  <CustomCreditsPanel
                    settings={settings}
                    value={customCredits}
                    disabled={submittingOrder}
                    onChange={setCustomCredits}
                    onSubmit={() => void submitOrder()}
                  />
                ) : null}
              </>
            )}

            <RechargeRecentOrdersPanel
              orders={recentOrders}
              activeOrderId={order?.id}
              loading={loadingRecentOrders}
              onReload={() => void loadRecentOrders()}
              onResumeOrder={(selected) => payment.replaceOrder(selected)}
            />
          </div>
        )
      ) : null}

      {/* Tab 2: Cloud Storage VIP (STRICTLY gated by cloudStorageEnabled === true) */}
      {cloudStorageEnabled && activeTab === "storage" ? (
        <div className="flex flex-col gap-4">
          {entitlement &&
          (entitlement.unlimited ||
            entitlement.storage_bytes > 0 ||
            entitlement.tier === "active" ||
            entitlement.tier === "grace") ? (
            <StorageEntitlementPanel entitlement={entitlement} />
          ) : (
            <section className="rounded-xl border border-border/70 bg-card p-5 dark:border-white/[0.08] dark:bg-[#17181c]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border/75 bg-surface-muted text-foreground">
                    <Cloud className="size-4.5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      当前为免费云端暂存模式（保留 {freeRetentionDays} 天）
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      开通云存储会员后即可升级为长期不限张数畅存，保护所有云端高清成片原图。
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  免费档 · {freeRetentionDays} 天自动清理
                </Badge>
              </div>
            </section>
          )}

          {/* Policy Highlights */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-card p-4 dark:border-white/[0.08] dark:bg-[#17181c]">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>30天不限张数畅存</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                会员有效期内生成与保存的全部云端原图均受保护，不设张数上限与空间门槛。
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4 dark:border-white/[0.08] dark:bg-[#17181c]">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Cloud className="size-4 text-amber-500" />
                <span>{vipGraceDays}天到期宽限缓冲期</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                会员到期后自动享有 {vipGraceDays} 天数据保留缓冲，期间续费即可无缝顺延畅存权益。
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4 dark:border-white/[0.08] dark:bg-[#17181c]">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="size-4 text-sky-500" />
                <span>多次购买自动顺延</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                支持随时叠加续订，新购时长自动顺延累加至现有到期时间之后。
              </p>
            </div>
          </section>

          {!settings?.recharge_enabled ? (
            <EmptyState
              icon={Cloud}
              title="在线支付暂未开启"
              description="请联系站点管理员开启在线支付通道后再购买云存储会员套餐。"
              action={
                isAdmin ? (
                  <Button size="sm" asChild>
                    <Link to="/admin/payments?tab=settings">
                      前往支付管理开启充值
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {channelSelector}
              {activeOrderPanel ? (
                activeOrderPanel
              ) : storageProducts.length > 0 ? (
                <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {storageProducts.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      disabled={submittingOrder}
                      onSubmit={(item) => void submitOrder(item)}
                    />
                  ))}
                </section>
              ) : (
                <EmptyState
                  icon={Cloud}
                  title="暂未上架云存储会员套餐"
                  description="管理员尚未配置云存储会员 SKU（例如 ¥9.9 / 30天 不限张数畅存）。"
                  action={
                    isAdmin ? (
                      <Button size="sm" asChild>
                        <Link to="/admin/payments?tab=products">
                          前往后台一键配置云存储套餐
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Tab 3: Redeem & Invite */}
      {activeTab === "redeem" ? (
        <ProfileInviteRedeemCard
          inviteInfo={invite.inviteInfo}
          inviteLink={invite.inviteLink}
          inviteError={invite.inviteError}
          isLoadingInvite={invite.isLoadingInvite}
          redeemKey={credits.redeemKey}
          isRedeeming={credits.isRedeeming}
          onCopy={(value) => void handleCopy(value)}
          onRetryInvite={() => void invite.loadInvite(true)}
          onRedeemKeyChange={credits.setRedeemKey}
          onRedeem={() => void credits.handleRedeem()}
        />
      ) : null}

      {/* Tab 4: Credit Ledger */}
      {activeTab === "ledger" ? (
        credits.isLoadingCredits && credits.creditLedger.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border/70 bg-card dark:border-white/[0.08] dark:bg-[#17181c]">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ProfileCreditLedgerTable
            creditLedger={credits.creditLedger}
            pagedCreditLedger={credits.pagedCreditLedger}
            sortedCreditLedgerLength={credits.sortedCreditLedgerLength}
            safeCreditLedgerPage={credits.safeCreditLedgerPage}
            creditLedgerPageCount={credits.creditLedgerPageCount}
            creditLedgerPageSize={credits.creditLedgerPageSize}
            onPageChange={credits.setCreditLedgerPage}
          />
        )
      ) : null}

      <ConfirmDialog
        open={leaveGuard.isOpen}
        tone="warning"
        title="当前有待扫码支付的订单"
        description="离开当前页面不会中断已扫码的入账，你也可以选择直接取消当前未支付订单后再离开。"
        cancelLabel="继续扫码支付"
        secondaryAction={{
          label: "取消订单并离开",
          variant: "destructive",
          pending: leaveGuard.isDiscarding,
          pendingLabel: "正在取消…",
          onClick: () => void leaveGuard.confirmDiscardAndLeave(),
        }}
        confirmLabel="保留订单并离开"
        pendingLabel="正在跳转…"
        pending={leaveGuard.isSaving}
        onClose={leaveGuard.cancelLeave}
        onConfirm={() => void leaveGuard.confirmSaveAndLeave()}
      />
    </section>
  );
}
