import { ArrowUpRight, PackageOpen, Ticket } from "lucide-react";
import { Link } from "react-router-dom";

import {
  CustomCreditsPanel,
  ProductTile,
  RechargeErrorPanel,
  RechargeHeaderActions,
} from "@/app/recharge/recharge-panels";
import { RechargeOrderStatus } from "@/app/recharge/recharge-order-status";
import { StorageEntitlementPanel } from "@/app/recharge/storage-entitlement-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type {
  PaymentChannel,
  PaymentOrder,
  PaymentSettings,
  RechargeProduct,
} from "@/lib/user-admin-api";

function formatChannelOptionLabel(channel: PaymentChannel): string {
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

export function RechargeReadyView({
  products,
  channels,
  settings,
  selectedChannelID,
  storageEntitlement,
  creditBalance,
  isAdmin = false,
  custom,
  order,
  submitting,
  querying,
  cancelling,
  error,
  onChannelChange,
  onCustomChange,
  onSubmit,
  onCancel,
  onReset,
  onRefresh,
}: {
  products: RechargeProduct[];
  channels: PaymentChannel[];
  settings: PaymentSettings;
  selectedChannelID: string;
  storageEntitlement: {
    storage_bytes: number;
    used_bytes: number;
    expires_at?: string;
  } | null;
  creditBalance: number | null;
  isAdmin?: boolean;
  custom: number;
  order: PaymentOrder | null;
  submitting: boolean;
  querying: boolean;
  cancelling: boolean;
  error: string;
  onChannelChange: (channelID: string) => void;
  onCustomChange: (credits: number) => void;
  onSubmit: (product?: RechargeProduct) => void;
  onCancel: () => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="算力与存储"
        title="充值中心"
        description="购买积分或云存储套餐，使用微信或支付宝扫码支付，到账后权益自动更新。"
        actions={<RechargeHeaderActions creditBalance={creditBalance} />}
      />
      {error ? <RechargeErrorPanel message={error} /> : null}
      {storageEntitlement && storageEntitlement.storage_bytes > 0 ? (
        <StorageEntitlementPanel entitlement={storageEntitlement} />
      ) : null}
      {!order && channels.length > 0 ? (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border/75 bg-card px-4 py-3.5 shadow-2xs">
          <span className="text-xs font-semibold text-foreground">支付方式</span>
          <div className="flex flex-wrap items-center gap-2">
            {channels.map((channel) => {
              const active = selectedChannelID === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => onChannelChange(channel.id)}
                  disabled={submitting}
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
                  {formatChannelOptionLabel(channel)}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {!order ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.length > 0 ? (
              products.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  disabled={submitting}
                  onSubmit={onSubmit}
                />
              ))
            ) : (
              <EmptyState
                icon={PackageOpen}
                title="暂无可购买套餐"
                description={
                  settings.custom_credits_enabled
                    ? "当前未上架固定面额套餐，你可直接使用下方自定义积分充值，或前往个人中心核销兑换码。"
                    : "当前暂未上架充值套餐，你可前往个人中心使用充值卡密核销积分。"
                }
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
                        <Link to="/payment-admin?tab=products">
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
              value={custom}
              disabled={submitting}
              onChange={onCustomChange}
              onSubmit={() => onSubmit()}
            />
          ) : null}
        </>
      ) : (
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
          onCancel={onCancel}
          onReset={onReset}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
}
