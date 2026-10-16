import type {
  GrokProvider,
  GrokProviderAccount,
  GrokProviderLink,
  GrokProviderStatus,
} from "@/lib/grok-provider-accounts-api";

export const PROVIDER_LABELS: Record<GrokProvider, string> = {
  build: "Grok Build",
  web: "Grok Web",
  console: "Grok Console",
};

export const STATUS_LABELS: Record<GrokProviderStatus, string> = {
  active: "可用",
  disabled: "已停用",
  error: "异常",
  unknown: "待检测",
};

const WEB_TIER_LABELS: Record<string, string> = {
  auto: "Auto",
  basic: "Basic",
  super: "Super",
  heavy: "Heavy",
};

const SOURCE_LABELS: Record<string, string> = {
  legacy_archive: "历史 Web 账号",
  runtime: "运行时账号",
  oauth_import: "OAuth 导入",
  managed_import: "账号导入",
  provider_import: "账号导入",
  web_build_conversion: "Web 转 Build",
  web_console_conversion: "Web 转 Console",
};

const CAPABILITY_LABELS: Record<string, string> = {
  text: "文本",
  chat: "文本",
  image: "图片",
  image_edit: "图片编辑",
  video: "视频",
};

export type ProviderDetectionView = {
  outcome: "ok" | "invalid" | "failed";
  code: string;
  statusCode: number;
  checkedAt: string;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function accountTypeLabel(account: GrokProviderAccount): string {
  if (account.provider === "console") return "Console";
  if (account.provider === "web") {
    const tier = stringValue(account.metadata.tier).toLowerCase();
    return WEB_TIER_LABELS[tier] || "Web";
  }
  const billing = account.quotas.find((quota) => quota.capability === "billing");
  const plan = stringValue(billing?.metadata.plan_name) || stringValue(billing?.metadata.plan_code);
  return plan || "OAuth";
}

export function credentialLabel(account: GrokProviderAccount): string {
  if (!account.has_credential) return "凭据缺失";
  if (account.credential_kind === "oauth") return "OAuth 有效";
  if (account.credential_kind === "sso") return "SSO 已保存";
  return `${account.credential_kind || "未知"} 已保存`;
}

export function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] || sourceType || "未知来源";
}

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] || capability;
}

export function accountDetection(account: GrokProviderAccount): ProviderDetectionView | null {
  const value = account.metadata.detection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const detection = value as Record<string, unknown>;
  const outcome = stringValue(detection.outcome);
  if (outcome !== "ok" && outcome !== "invalid" && outcome !== "failed") return null;
  return {
    outcome,
    code: stringValue(detection.code),
    statusCode: finiteNumber(detection.status_code),
    checkedAt: stringValue(detection.checked_at),
  };
}

export function accountDisplayTime(account: GrokProviderAccount): { label: string; value: string } {
  if (account.source_updated_at) return { label: "更新时间", value: account.source_updated_at };
  if (account.source_created_at) return { label: "创建时间", value: account.source_created_at };
  return { label: "投影时间", value: account.projected_at };
}

export function formatProviderDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const PROVIDER_ORDER: Record<GrokProvider, number> = { build: 0, web: 1, console: 2 };

export function orderedConnections(account: GrokProviderAccount): Array<{
  id: string;
  provider: GrokProvider;
  status: GrokProviderStatus;
  current: boolean;
}> {
  const current = { id: account.id, provider: account.provider, status: account.status, current: true };
  const links = account.links.map((link: GrokProviderLink) => ({
    id: link.account_id,
    provider: link.provider,
    status: link.status,
    current: false,
  }));
  return [current, ...links].sort((left, right) =>
    PROVIDER_ORDER[left.provider] - PROVIDER_ORDER[right.provider] || left.id.localeCompare(right.id));
}
