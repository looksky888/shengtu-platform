import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  PackageOpen,
  ReceiptText,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

import { PaymentChannelsSection } from "@/app/payment-admin/payment-channels-section";
import { PaymentOrdersSection } from "@/app/payment-admin/payment-orders-section";
import { PaymentProductsSection } from "@/app/payment-admin/payment-products-section";
import { PaymentReconciliationsSection } from "@/app/payment-admin/payment-reconciliations-section";
import { PaymentOverviewSection } from "@/app/payment-admin/payment-overview-section";
import {
  fetchPaymentChannels,
  type PaymentChannel,
} from "@/lib/payment-admin-api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const tabs = [
  { key: "overview", label: "经营概览", icon: BarChart3 },
  { key: "channels", label: "支付渠道", icon: CreditCard },
  { key: "products", label: "商品管理", icon: PackageOpen },
  { key: "orders", label: "订单流水", icon: ReceiptText },
  { key: "reconciliations", label: "账单对账", icon: Scale },
] as const;

export function PaymentAdminContent() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("overview");
  const [channels, setChannels] = useState<PaymentChannel[]>([]);

  useEffect(() => {
    if (tab !== "reconciliations") return;
    void fetchPaymentChannels()
      .then((data) => setChannels(data.items))
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "加载支付渠道失败",
        ),
      );
  }, [tab]);

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <PageHeader eyebrow="支付管理" title="在线充值与支付" description="集中管理支付渠道、充值商品、订单和账单对账，所有状态变化都会保留在订单流水中。" />
      <nav
        aria-label="支付管理分组"
        className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-2xl border border-border bg-card/95 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur"
      >
        <div className="flex min-w-max gap-1" role="tablist">
          {tabs.map((item) => (
            <Button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              variant={tab === item.key ? "default" : "ghost"}
              className="rounded-xl"
              onClick={() => setTab(item.key)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Button>
          ))}
        </div>
      </nav>
      {tab === "overview" ? (
        <PaymentOverviewSection />
      ) : tab === "channels" ? (
        <PaymentChannelsSection />
      ) : tab === "products" ? (
        <PaymentProductsSection />
      ) : tab === "orders" ? (
        <PaymentOrdersSection />
      ) : (
        <PaymentReconciliationsSection channels={channels} />
      )}
    </section>
  );
}
