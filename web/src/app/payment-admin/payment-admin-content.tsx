import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  PackageOpen,
  ReceiptText,
  Scale,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PaymentChannelsSection } from "@/app/payment-admin/payment-channels-section";
import { PaymentOrdersSection } from "@/app/payment-admin/payment-orders-section";
import { PaymentOverviewSection } from "@/app/payment-admin/payment-overview-section";
import { PaymentProductsSection } from "@/app/payment-admin/payment-products-section";
import { PaymentReconciliationsSection } from "@/app/payment-admin/payment-reconciliations-section";
import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/ui/sub-nav";
import {
  fetchPaymentChannels,
  type PaymentChannel,
} from "@/lib/payment-admin-api";

const tabs = [
  { value: "overview", label: "经营概览", icon: BarChart3 },
  { value: "channels", label: "支付渠道", icon: CreditCard },
  { value: "products", label: "商品管理", icon: PackageOpen },
  { value: "orders", label: "订单流水", icon: ReceiptText },
  { value: "reconciliations", label: "账单对账", icon: Scale },
] as const;

type PaymentAdminTabKey = (typeof tabs)[number]["value"];

function parsePaymentTab(raw: string | null): PaymentAdminTabKey {
  return tabs.some((item) => item.value === raw)
    ? (raw as PaymentAdminTabKey)
    : "overview";
}

export function PaymentAdminContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parsePaymentTab(searchParams.get("tab"));
  const [channels, setChannels] = useState<PaymentChannel[]>([]);

  const handleTabChange = (nextTab: PaymentAdminTabKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "overview") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

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
      <PageHeader
        eyebrow="支付管理"
        title="在线充值与支付"
        description="集中管理支付渠道、充值商品、订单和账单对账，所有状态变化都会保留在订单流水中。"
      />
      <div className="sticky top-16 z-20 flex items-center">
        <SubNav
          ariaLabel="支付管理分组"
          items={tabs}
          value={tab}
          onValueChange={handleTabChange}
          layoutId="payment-admin-subnav"
        />
      </div>
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
