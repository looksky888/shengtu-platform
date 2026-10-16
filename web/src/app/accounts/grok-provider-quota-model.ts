export type ProviderQuotaValue = {
  capability: string;
  remaining: number | null;
  limit_value: number | null;
  reset_at: string;
  status: string;
};

export type ProviderQuotaSlot = {
  capability: string;
  label: string;
  remaining: number | null;
  limit: number | null;
  used: number | null;
  usedPercent: number | null;
  resetAt: string;
  status: string;
};

const WEB_MODES = [
  { capability: "auto", label: "Auto" },
  { capability: "fast", label: "Fast" },
  { capability: "expert", label: "Expert" },
  { capability: "heavy", label: "Heavy" },
] as const;

const CONSOLE_MODES = [
  { capability: "chat", label: "文本" },
  { capability: "image", label: "图片" },
  { capability: "video", label: "视频" },
] as const;

const BUILD_LABELS: Record<string, string> = {
  balance: "余额",
  chat: "文本",
  image: "图片",
  video: "视频",
};

function toSlot(capability: string, label: string, quota?: ProviderQuotaValue): ProviderQuotaSlot {
  const remaining = quota?.remaining ?? null;
  const limit = quota?.limit_value ?? null;
  const used = remaining == null || limit == null ? null : Math.max(0, limit - remaining);
  const usedPercent = used == null || limit == null || limit <= 0
    ? null
    : Math.min(100, used / limit * 100);
  return {
    capability,
    label,
    remaining,
    limit,
    used,
    usedPercent,
    resetAt: quota?.reset_at ?? "",
    status: quota?.status ?? "unknown",
  };
}

export function providerQuotaSlots(
  provider: "web" | "build" | "console",
  quotas: ProviderQuotaValue[],
  options: { webTier?: string } = {},
): ProviderQuotaSlot[] {
  if (quotas.length === 0) return [];
  const byCapability = new Map(quotas.map((quota) => [quota.capability, quota]));
  if (provider === "web") {
    const modes = options.webTier === "basic" ? WEB_MODES.filter(({ capability }) => capability === "fast") : WEB_MODES;
    return modes.map(({ capability, label }) => toSlot(capability, label, byCapability.get(capability)));
  }
  if (provider === "console") {
    return CONSOLE_MODES.map(({ capability, label }) => toSlot(capability, label, byCapability.get(capability)));
  }
  return [...quotas]
    .sort((left, right) => left.capability.localeCompare(right.capability))
    .map((quota) => toSlot(quota.capability, BUILD_LABELS[quota.capability] || quota.capability, quota));
}
