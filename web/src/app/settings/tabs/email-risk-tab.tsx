import { useState } from "react";

import { EmailRegistrationOverview } from "../components/email-registration-overview";
import { EmailSettingsCard } from "../components/email-settings-card";
import { RegistrationRiskBlocksCard } from "../components/registration-risk-blocks-card";
import { RegistrationRiskSettingsCard } from "../components/registration-risk-settings-card";

export default function EmailRiskTab() {
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);
  const [riskEnabled, setRiskEnabled] = useState<boolean | null>(null);
  const [activeBlocksCount, setActiveBlocksCount] = useState<number | null>(
    null,
  );

  return (
    <section className="flex flex-col gap-5">
      <EmailRegistrationOverview
        smtpEnabled={smtpEnabled}
        riskEnabled={riskEnabled}
        activeBlocksCount={activeBlocksCount}
      />
      <EmailSettingsCard onStatusChange={setSmtpEnabled} />
      <RegistrationRiskSettingsCard onStatusChange={setRiskEnabled} />
      <RegistrationRiskBlocksCard onCountChange={setActiveBlocksCount} />
    </section>
  );
}
