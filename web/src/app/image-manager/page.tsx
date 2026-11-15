"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ImageManagerContent } from "@/app/image-manager/image-manager-content";
import { imageManagerCacheScope } from "@/app/image-manager/image-manager-utils";
import { useAppMeta } from "@/lib/use-app-meta";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { fetchPaymentConfig, type PaymentConfig } from "@/lib/user-payment-api";
import { canAccessPath, hasAPIPermission } from "@/store/auth";

export default function ImageManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image-manager");
  const appMeta = useAppMeta();
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);

  const canReadPaymentConfig = Boolean(
    session && hasAPIPermission(session, "GET", "/api/payment/config"),
  );

  useEffect(() => {
    if (!canReadPaymentConfig) return;
    let active = true;
    fetchPaymentConfig()
      .then((cfg) => {
        if (active) setPaymentConfig(cfg);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canReadPaymentConfig]);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canDeleteImages = hasAPIPermission(session, "DELETE", "/api/images");
  const canOpenRecharge = canAccessPath(session, "/recharge");
  const metaCloudFlag = (appMeta as { cloud_storage_enabled?: boolean }).cloud_storage_enabled;
  const cloudStorageEnabled =
    paymentConfig !== null
      ? Boolean(paymentConfig.cloud_storage_enabled)
      : metaCloudFlag === true;

  return (
    <ImageManagerContent
      cacheScope={imageManagerCacheScope(session)}
      canDeleteImages={canDeleteImages}
      isAdmin={session.role === "admin"}
      cloudStorageEnabled={cloudStorageEnabled}
      entitlement={paymentConfig?.storage_entitlement ?? null}
      freeRetentionDays={paymentConfig?.free_retention_days ?? 3}
      vipGraceDays={paymentConfig?.vip_grace_days ?? 7}
      canOpenRecharge={canOpenRecharge}
    />
  );
}
