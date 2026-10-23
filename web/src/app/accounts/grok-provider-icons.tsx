import { Compass, Layers3, SquareTerminal, Webhook, type LucideIcon } from "lucide-react";

import type { GrokProvider } from "@/lib/grok-provider-accounts-api";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<GrokProvider, { icon: LucideIcon; tone: string }> = {
  build: { icon: SquareTerminal, tone: "text-foreground" },
  web: { icon: Compass, tone: "text-foreground" },
  console: { icon: Webhook, tone: "text-foreground" },
};

export function GrokProviderIcon({ provider, className }: { provider: GrokProvider; className?: string }) {
  const item = PROVIDER_ICONS[provider];
  const Icon = item.icon;
  return <Icon className={cn("size-4", item.tone, className)} />;
}

export function GrokAllProvidersIcon({ className }: { className?: string }) {
  return <Layers3 className={className} />;
}
