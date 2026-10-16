import { GrokProviderCenter } from "@/app/accounts/grok-provider-center";
import type { StoredAuthSession } from "@/store/auth";

export function GrokAccountsPanel({ session }: { session: StoredAuthSession }) {
  return <GrokProviderCenter session={session} />;
}
