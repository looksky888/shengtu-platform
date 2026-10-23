import { GrokProviderCenter } from "@/app/accounts/grok-provider-center";
import type { GrokProviderCenterController } from "@/app/accounts/use-grok-provider-center";
import type { StoredAuthSession } from "@/store/auth";

export function GrokAccountsPanel({
  session,
  controller,
  importOpen,
  onImportOpenChange,
}: {
  session: StoredAuthSession;
  controller: GrokProviderCenterController;
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
}) {
  return (
    <GrokProviderCenter
      session={session}
      controller={controller}
      importOpen={importOpen}
      onImportOpenChange={onImportOpenChange}
    />
  );
}
