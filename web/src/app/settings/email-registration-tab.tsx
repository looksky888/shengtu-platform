import { EmailRegistrationOverview } from "./components/email-registration-overview";
import {
  EmailSettingsCard,
  RegistrationRiskBlocksCard,
  RegistrationRiskSettingsCard,
} from "./settings-tab-lazy";

export function EmailRegistrationTab({ canManageSystem }: { canManageSystem: boolean }) {
  if (!canManageSystem) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground shadow-2xs">
        仅管理员可配置邮箱注册、注册风控和封禁记录。
      </div>
    );
  }

  return (
    <section className="grid items-start gap-5 md:grid-cols-2">
      <div className="md:col-span-2"><EmailRegistrationOverview /></div>
      <div className="grid min-w-0 content-start gap-5">
        <EmailSettingsCard />
        <RegistrationRiskBlocksCard />
      </div>
      <RegistrationRiskSettingsCard />
    </section>
  );
}
