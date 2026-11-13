"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Cloud,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PaymentChannelsSection } from "@/app/payment-admin/payment-channels-section";
import { PaymentOrdersSection } from "@/app/payment-admin/payment-orders-section";
import { ProductEditorDialog } from "@/app/payment-admin/payment-product-dialog";
import { PaymentProductsSection } from "@/app/payment-admin/payment-products-section";
import { PaymentReconciliationsSection } from "@/app/payment-admin/payment-reconciliations-section";
import { PaymentSettingsSection } from "@/app/payment-admin/payment-settings-section";
import {
  AdminPageFrame,
  AdminSlideDrawer,
  AdminStatusBadge,
  AdminUnderlineTabs,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  createAdminRechargeProduct,
  fetchPaymentChannels,
  fetchPaymentSettings,
  type PaymentChannel,
  type PaymentSettings,
  type RechargeProductInput,
} from "@/lib/payment-admin-api";
import { useAuthGuard } from "@/lib/use-auth-guard";

type PaymentsAdminTab = "products" | "orders" | "channels";

const PAYMENTS_TABS = [
  { value: "products" as const, label: "算力与云存储套餐" },
  { value: "orders" as const, label: "支付订单对账" },
  { value: "channels" as const, label: "支付网关通道" },
] as const;

const UNLIMITED_VIP_PRESET: RechargeProductInput = {
  sku: "vip-cloud-30d",
  name: "云存储 VIP 会员（30天无限容量）",
  description: "有效期内所有生图与视频云端持久保存，不限张数畅存（¥9.9 / 30天）。",
  amount_fen: 990,
  credits: 0,
  enabled: true,
  sort_order: 10,
  product_type: "cloud_storage",
  storage_days: 30,
  storage_bytes: 0,
};

export default function AdminPaymentsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/admin/payments");
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<PaymentsAdminTab>("products");
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [productsRemountKey, setProductsRemountKey] = useState(0);

  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetForm, setPresetForm] = useState<RechargeProductInput>(UNLIMITED_VIP_PRESET);
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    const rawTab = searchParams.get("tab");
    const rawDrawer = searchParams.get("drawer");
    if (rawTab === "settings" || rawDrawer === "settings") {
      setSettingsDrawerOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      if (rawTab === "settings") {
        nextParams.delete("tab");
        setActiveTab("products");
      }
      if (rawDrawer === "settings") {
        nextParams.delete("drawer");
      }
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadCloudSummary = useCallback(async () => {
    try {
      const res = await fetchPaymentSettings();
      setPaymentSettings(res.item);
    } catch {
      // Non-blocking status banner
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadCloudSummary();
  }, [loadCloudSummary, session]);

  useEffect(() => {
    if (!session || activeTab !== "orders") return;
    void fetchPaymentChannels()
      .then((res) => setChannels(res.items || []))
      .catch(() => undefined);
  }, [activeTab, session]);

  const handleSavePreset = async () => {
    setSavingPreset(true);
    try {
      await createAdminRechargeProduct(presetForm);
      toast.success("已创建 ¥9.9 / 30天 无限量云存储 VIP 套餐");
      setPresetDialogOpen(false);
      setProductsRemountKey((k) => k + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建云存储套餐失败");
    } finally {
      setSavingPreset(false);
    }
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const cloudVipEnabled = Boolean(paymentSettings?.cloud_storage_enabled);

  return (
    <AdminPageFrame
      groupLabel="商业与运营"
      title="支付与套餐"
      description="配置前台算力积分充值包、云存储 VIP 套餐（支持 storage_bytes = 0 不限容量）、订单流水追踪与微信/支付宝网关通道。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSettingsDrawerOpen(true)}
        >
          <SlidersHorizontal className="size-3.5" />
          充值业务规则
        </Button>
      }
    >
      <AdminUnderlineTabs
        items={PAYMENTS_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="products"
      />

      {activeTab === "products" ? (
        <div className="space-y-4">
          {/* Cloud Storage VIP Master Switch Status Callout */}
          <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] text-[var(--admin-text)]">
                <Cloud className="size-4" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--admin-text)]">
                    云存储付费会员制（VIP 留存策略）总开关
                  </span>
                  <AdminStatusBadge tone={cloudVipEnabled ? "success" : "neutral"}>
                    {cloudVipEnabled ? "已启用" : "已关闭（默认永久留存）"}
                  </AdminStatusBadge>
                </div>
                <p className="text-[12px] text-[var(--admin-text-muted)]">
                  {cloudVipEnabled
                    ? `当前已开启商业化留存策略（免费用户保留 ${paymentSettings?.free_retention_days ?? 3} 天 · VIP 宽限 ${paymentSettings?.vip_grace_days ?? 7} 天）。可上架 storage_bytes = 0 的无限容量云存储月卡。`
                    : "当前总开关处于关闭状态，前台隐藏所有 VIP 续费提示且 R2 / 本地历史图片永久保留。如需商业化售卖云存储会员，请前往存储设置开启总开关。"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPresetForm({
                    ...UNLIMITED_VIP_PRESET,
                    sku: `vip-cloud-30d-${Date.now().toString(36).slice(-4)}`,
                  });
                  setPresetDialogOpen(true);
                }}
              >
                <Sparkles className="size-3.5" />
                快速创建 ¥9.9/30天 云存储 SKU
              </Button>
              <Button asChild size="sm">
                <Link to="/admin/settings/storage">
                  前往存储与备份配置总开关
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          <PaymentProductsSection key={productsRemountKey} />

          <ProductEditorDialog
            open={presetDialogOpen}
            editing={false}
            product={presetForm}
            saving={savingPreset}
            onOpenChange={setPresetDialogOpen}
            onChange={(key, value) =>
              setPresetForm((prev) => ({ ...prev, [key]: value }))
            }
            onSave={() => void handleSavePreset()}
          />
        </div>
      ) : activeTab === "orders" ? (
        <div className="space-y-5">
          <PaymentOrdersSection />
          <PaymentReconciliationsSection channels={channels} />
        </div>
      ) : (
        <PaymentChannelsSection />
      )}

      <AdminSlideDrawer
        open={settingsDrawerOpen}
        onOpenChange={setSettingsDrawerOpen}
        title="充值与支付业务规则"
        description="控制前台在线充值开关及自定义积分计价边界（云存储 VIP 留存总开关由存储与备份统一管理）"
        widthClassName="w-[min(720px,100vw)]"
      >
        {settingsDrawerOpen ? (
          <PaymentSettingsSection
            hideCloudStorageToggle
            onSaved={(saved) => {
              setPaymentSettings(saved);
              void loadCloudSummary();
            }}
          />
        ) : null}
      </AdminSlideDrawer>
    </AdminPageFrame>
  );
}
