import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Cloud,
  CreditCard,
  PackageOpen,
  ReceiptText,
  Scale,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PaymentChannelsSection } from "@/app/payment-admin/payment-channels-section";
import { PaymentOrdersSection } from "@/app/payment-admin/payment-orders-section";
import { PaymentOverviewSection } from "@/app/payment-admin/payment-overview-section";
import { ProductEditorDialog } from "@/app/payment-admin/payment-product-dialog";
import { PaymentProductsSection } from "@/app/payment-admin/payment-products-section";
import { PaymentReconciliationsSection } from "@/app/payment-admin/payment-reconciliations-section";
import { PaymentSettingsSection } from "@/app/payment-admin/payment-settings-section";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createAdminRechargeProduct,
  fetchPaymentChannels,
  fetchPaymentSettings,
  type PaymentChannel,
  type PaymentSettings,
  type RechargeProductInput,
} from "@/lib/payment-admin-api";
import { cn } from "@/lib/utils";

const PAYMENT_TABS = [
  { key: "overview", label: "经营概览", icon: BarChart3 },
  { key: "channels", label: "支付渠道", icon: CreditCard },
  { key: "products", label: "商品管理", icon: PackageOpen },
  { key: "orders", label: "订单流水", icon: ReceiptText },
  { key: "reconciliations", label: "账单对账", icon: Scale },
  { key: "settings", label: "充值规则", icon: SlidersHorizontal },
] as const;

type PaymentTabKey = (typeof PAYMENT_TABS)[number]["key"];

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

function resolvePaymentTab(raw: string | null): PaymentTabKey {
  const found = PAYMENT_TABS.find((item) => item.key === raw);
  return found ? found.key : "overview";
}

export function PaymentAdminContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolvePaymentTab(searchParams.get("tab"));
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [productsRemountKey, setProductsRemountKey] = useState(0);

  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetForm, setPresetForm] = useState<RechargeProductInput>(UNLIMITED_VIP_PRESET);
  const [savingPreset, setSavingPreset] = useState(false);

  const setTab = useCallback(
    (next: PaymentTabKey) => {
      const params = new URLSearchParams(searchParams);
      if (next === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const loadCloudSummary = useCallback(async () => {
    try {
      const res = await fetchPaymentSettings();
      setPaymentSettings(res.item);
    } catch {
      // Non-blocking status summary
    }
  }, []);

  useEffect(() => {
    void loadCloudSummary();
  }, [loadCloudSummary]);

  useEffect(() => {
    if (tab !== "reconciliations") return;
    void fetchPaymentChannels()
      .then((data) => setChannels(data.items || []))
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "加载支付渠道失败",
        ),
      );
  }, [tab]);

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

  const cloudStorageEnabled = Boolean(paymentSettings?.cloud_storage_enabled);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader eyebrow="支付管理" title="在线充值与支付" />

      <nav
        aria-label="支付管理分组"
        className="sticky top-[72px] z-10 -mx-1 overflow-x-auto rounded-[22px] border border-border bg-card/95 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur"
      >
        <div className="flex min-w-max gap-1" role="tablist">
          {PAYMENT_TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                variant={active ? "default" : "ghost"}
                className={cn(
                  "rounded-full px-4",
                  active && "bg-[#1456f0] text-white hover:bg-[#1048ce]",
                )}
                onClick={() => setTab(item.key)}
              >
                <item.icon className="size-4" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </nav>

      {tab === "overview" ? (
        <PaymentOverviewSection onOpenSettings={() => setTab("settings")} />
      ) : tab === "channels" ? (
        <PaymentChannelsSection />
      ) : tab === "products" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <Cloud className="size-4" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    云存储付费会员制（VIP 留存策略）总开关
                  </span>
                  <Badge variant={cloudStorageEnabled ? "success" : "secondary"}>
                    {cloudStorageEnabled ? "已启用" : "已关闭（默认永久留存）"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cloudStorageEnabled
                    ? `当前已开启商业化留存策略（免费用户保留 ${paymentSettings?.free_retention_days ?? 3} 天 · VIP 宽限 ${paymentSettings?.vip_grace_days ?? 7} 天）。可上架 storage_bytes = 0 的无限容量云存储月卡。`
                    : "当前总开关处于关闭状态，前台隐藏所有 VIP 续费提示且 R2 / 本地历史图片永久保留。如需商业化售卖云存储会员，请前往「设置 -> 媒体存储」开启总开关。"}
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
              <Button
                asChild
                size="sm"
                className="bg-[#1456f0] text-white hover:bg-[#1048ce]"
              >
                <Link to="/settings?tab=media">
                  前往媒体存储配置总开关
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
      ) : tab === "orders" ? (
        <PaymentOrdersSection />
      ) : tab === "reconciliations" ? (
        <PaymentReconciliationsSection channels={channels} />
      ) : (
        <PaymentSettingsSection
          hideCloudStorageToggle={true}
          onSaved={(saved) => {
            setPaymentSettings(saved);
            void loadCloudSummary();
          }}
        />
      )}
    </section>
  );
}
