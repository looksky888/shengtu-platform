import { useEffect, useState } from "react";

import { EmailRegistrationOverview } from "../components/email-registration-overview";
import { EmailSettingsCard } from "../components/email-settings-card";
import { RegistrationRiskBlocksCard } from "../components/registration-risk-blocks-card";
import { RegistrationRiskSettingsCard } from "../components/registration-risk-settings-card";
import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tab-types";

export default function EmailRiskTab() {
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);
  const [riskEnabled, setRiskEnabled] = useState<boolean | null>(null);
  const [activeBlocksCount, setActiveBlocksCount] = useState<number | null>(
    null,
  );
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (
        !detail?.tab ||
        detail.tab === "email" ||
        detail.tab === "access"
      ) {
        setRefreshSignal((prev) => prev + 1);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleRefresh);
  }, []);

  return (
    <section className="flex flex-col gap-5">
      <div id="settings-section-email-overview">
        <EmailRegistrationOverview
          smtpEnabled={smtpEnabled}
          riskEnabled={riskEnabled}
          activeBlocksCount={activeBlocksCount}
        />
      </div>
      <div id="settings-section-email-smtp">
        <EmailSettingsCard
          refreshSignal={refreshSignal}
          onStatusChange={setSmtpEnabled}
        />
      </div>
      <div id="settings-section-email-risk">
        <RegistrationRiskSettingsCard
          refreshSignal={refreshSignal}
          onStatusChange={setRiskEnabled}
        />
      </div>
      <div id="settings-section-email-blocks">
        <RegistrationRiskBlocksCard
          refreshSignal={refreshSignal}
          onCountChange={setActiveBlocksCount}
        />
      </div>
    </section>
  );
}
