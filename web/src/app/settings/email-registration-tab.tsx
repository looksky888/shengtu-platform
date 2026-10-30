"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import { EmailRegistrationOverview } from "./components/email-registration-overview";
import {
  EmailSettingsCard,
  RegistrationRiskBlocksCard,
  RegistrationRiskSettingsCard,
} from "./settings-tab-lazy";
import { SETTINGS_TAB_REFRESH_EVENT } from "./settings-tabs";

const ANCHOR_WRAPPER_CLASS =
  "min-w-0 scroll-mt-32 rounded-[14px] transition-shadow duration-300 data-[anchor-flash='1']:ring-2 data-[anchor-flash='1']:ring-foreground/35";

export function EmailRegistrationTab({
  canManageSystem,
}: {
  canManageSystem: boolean;
}) {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);
  const [riskEnabled, setRiskEnabled] = useState<boolean | null>(null);
  const [activeBlocksCount, setActiveBlocksCount] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!canManageSystem || typeof window === "undefined") return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === "email") {
        setRefreshSignal((prev) => prev + 1);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
  }, [canManageSystem]);

  if (!canManageSystem) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="需要管理员权限"
        description="仅系统管理员可配置开放注册策略、SMTP 邮件服务与多维注册风控。"
        className="rounded-[14px] border border-border/80 bg-surface py-12 shadow-2xs"
      />
    );
  }

  return (
    <section className="space-y-5">
      <div
        id="settings-section-email-overview"
        data-settings-section="settings-section-email-overview"
        className={ANCHOR_WRAPPER_CLASS}
      >
        <EmailRegistrationOverview
          smtpEnabled={smtpEnabled}
          riskEnabled={riskEnabled}
          activeBlocksCount={activeBlocksCount}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="grid min-w-0 content-start gap-5">
          <div
            id="settings-section-email-smtp"
            data-settings-section="settings-section-email-smtp"
            className={ANCHOR_WRAPPER_CLASS}
          >
            <EmailSettingsCard
              refreshSignal={refreshSignal}
              onStatusChange={setSmtpEnabled}
            />
          </div>
          <div
            id="settings-section-email-blocks"
            data-settings-section="settings-section-email-blocks"
            className={ANCHOR_WRAPPER_CLASS}
          >
            <RegistrationRiskBlocksCard
              refreshSignal={refreshSignal}
              onCountChange={setActiveBlocksCount}
            />
          </div>
        </div>

        <div
          id="settings-section-email-risk"
          data-settings-section="settings-section-email-risk"
          className={ANCHOR_WRAPPER_CLASS}
        >
          <RegistrationRiskSettingsCard
            refreshSignal={refreshSignal}
            onStatusChange={setRiskEnabled}
          />
        </div>
      </div>
    </section>
  );
}
