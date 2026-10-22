import { CustomCreditsPanel, ProductTile, RechargeErrorPanel } from "@/app/recharge/recharge-panels";
import { RechargeOrderStatus } from "@/app/recharge/recharge-order-status";
import { StorageEntitlementPanel } from "@/app/recharge/storage-entitlement-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { PaymentChannel, PaymentOrder, PaymentSettings, RechargeProduct } from "@/lib/user-admin-api";

export function RechargeReadyView({
  products,
  channels,
  settings,
  selectedChannelID,
  storageEntitlement,
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
  storageEntitlement: { storage_bytes: number; used_bytes: number; expires_at?: string } | null;
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
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader
        eyebrow="算力与存储"
        title="充值中心"
        description="购买积分或云存储套餐，使用微信或支付宝扫码支付，到账后权益自动更新。"
      />
      {error ? <RechargeErrorPanel message={error} /> : null}
      {storageEntitlement && storageEntitlement.storage_bytes > 0 ? (
        <StorageEntitlementPanel entitlement={storageEntitlement} />
      ) : null}
      {!order && channels.length > 0 ? (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <span className="text-sm font-medium">支付方式</span>
          {channels.map((channel) => (
            <Button key={channel.id} type="button" size="sm" variant={selectedChannelID === channel.id ? "default" : "outline"} onClick={() => onChannelChange(channel.id)} disabled={submitting}>
              {channel.provider === "alipay" ? "支付宝扫码" : "微信支付扫码"}
            </Button>
          ))}
        </section>
      ) : null}
      {!order ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.length > 0 ? products.map((product) => <ProductTile key={product.id} product={product} disabled={submitting} onSubmit={onSubmit} />) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">暂无可购买套餐，请稍后再试。</div>
            )}
          </section>
          {settings.custom_credits_enabled ? <CustomCreditsPanel settings={settings} value={custom} disabled={submitting} onChange={onCustomChange} onSubmit={() => onSubmit()} /> : null}
        </>
      ) : (
        <RechargeOrderStatus
          order={order}
          provider={channels.find((item) => item.id === order.channel_id)?.provider || channels.find((item) => item.id === selectedChannelID)?.provider || "wechatpay"}
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
