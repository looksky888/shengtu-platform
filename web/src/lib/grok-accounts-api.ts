import { httpRequest } from "@/lib/request";

export * from "@/lib/grok-oauth-api";

export type GrokQuotaMode = "auto" | "fast" | "expert" | "heavy" | "console";

export type GrokQuotaWindow = {
  remaining?: number;
  total?: number;
  reset_at?: number;
  source?: number;
};

export type GrokQuota = Partial<Record<GrokQuotaMode, GrokQuotaWindow | number>>;

export type GrokMediaQuota = {
  status?: "available" | "exhausted" | "unknown" | string;
  remaining?: number;
  total?: number;
  reset_at?: number;
  source?: string;
};

export type GrokMediaCapability = {
  supported?: boolean;
  available?: boolean;
  reason?: "tier_not_supported" | "account_blocked" | "cooldown" | "quota_exhausted" | "health_unknown" | string;
};

export type GrokAccountHealth = {
  state?: "active" | "cooldown" | "invalid" | "expired" | "disabled" | "reauth" | "unknown" | string;
  reason?: string;
};

/** Linked xAI CLI OAuth account (from register OAuth protocol). */
export type GrokOAuthLink = {
  id?: string;
  email?: string;
  status?: string;
  disabled?: boolean;
  models?: string[];
  subject?: string;
  source_type?: string;
  updated_at?: string | number | null;
  [key: string]: unknown;
};

export type GrokAccount = {
  id: string;
  platform?: string;
  email?: string;
  status?: string;
  source_type?: string;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
  has_sso?: boolean;
  has_password?: boolean;
  note?: string;
  token_preview?: string;
  pool?: string;
  runtime_status?: string | null;
  quota?: GrokQuota | null;
  use_count?: number;
  fail_count?: number;
  last_used_at?: string | number | null;
  refresh_status?: string;
  refresh_at?: string | number | null;
  refresh_error?: string;
  tags?: string[];
  sync_state?: string;
  /** Linked CLI OAuth row (null when protocol auth not done). */
  oauth?: GrokOAuthLink | null;
  account_health?: GrokAccountHealth;
  capabilities?: { image?: GrokMediaCapability; video?: GrokMediaCapability };
  media_quota?: { image?: GrokMediaQuota; video?: GrokMediaQuota };
};

export type GrokAccountsSummary = {
  total?: number;
  active?: number;
  disabled?: number;
  pending?: number;
  pending_sso?: number;
  failed?: number;
  synced?: number;
  not_synced?: number;
  runtime_total?: number;
  oauth_total?: number;
  oauth_linked?: number;
  runtime_status?: Partial<Record<"active" | "cooling" | "invalid" | "disabled", number>>;
  calls_total?: number;
  quota?: Partial<Record<GrokQuotaMode, number>>;
  refresh_failed?: number;
  media?: {
    image?: { supported?: number; available?: number; exhausted?: number };
    video?: { supported?: number; available?: number; exhausted?: number };
  };
};

export type GrokAccountsListResponse = {
  items: GrokAccount[];
  count?: number;
  total?: number;
  all_total?: number;
  page?: number;
  page_size?: number;
  summary?: GrokAccountsSummary;
  runtime_available?: boolean;
  runtime_error?: string;
};

const GROK_QUOTA_LABELS: Record<GrokQuotaMode, string> = {
  auto: "A",
  fast: "F",
  expert: "E",
  heavy: "H",
  console: "C",
};

export function formatGrokQuotaText(quota?: GrokQuota | null): string {
  if (!quota || typeof quota !== "object") return "—";
  const parts: string[] = [];
  (Object.keys(GROK_QUOTA_LABELS) as GrokQuotaMode[]).forEach((mode) => {
    const raw = quota[mode];
    let remaining: number | null = null;
    if (typeof raw === "number" && Number.isFinite(raw)) remaining = Math.max(0, Math.trunc(raw));
    else if (raw && typeof raw === "object" && Number.isFinite(Number((raw as GrokQuotaWindow).remaining))) {
      remaining = Math.max(0, Math.trunc(Number((raw as GrokQuotaWindow).remaining)));
    }
    if (remaining !== null) parts.push(`${GROK_QUOTA_LABELS[mode]} ${remaining}`);
  });
  return parts.length ? parts.join(" · ") : "—";
}

/** True when any A/F/E/H/C window has total or remaining > 0. */
export function hasGrokQuotaData(quota?: GrokQuota | null): boolean {
  if (!quota || typeof quota !== "object") return false;
  return (Object.keys(GROK_QUOTA_LABELS) as GrokQuotaMode[]).some((mode) => {
    const raw = quota[mode];
    if (typeof raw === "number") return raw > 0;
    if (raw && typeof raw === "object") {
      const rem = Number((raw as GrokQuotaWindow).remaining);
      const tot = Number((raw as GrokQuotaWindow).total);
      return (Number.isFinite(rem) && rem > 0) || (Number.isFinite(tot) && tot > 0);
    }
    return false;
  });
}

export function formatGrokMediaQuota(quota?: GrokMediaQuota): string {
  if (!quota) return "未知";
  const status = String(quota.status || "unknown").toLowerCase();
  if (status === "exhausted") return "额度耗尽";
  if (typeof quota.remaining === "number" && typeof quota.total === "number") {
    return `${Math.max(0, quota.remaining)} / ${Math.max(0, quota.total)}`;
  }
  return status === "available" ? "可用·额度未知" : "额度未知";
}

export function formatGrokMediaCapability(
  capability?: GrokMediaCapability,
  quota?: GrokMediaQuota,
  health?: GrokAccountHealth,
): string {
  if (!capability?.supported) return "套餐不支持";
  if (String(health?.state || "").toLowerCase() === "cooldown") return "冷却中";
  if (String(health?.state || "").toLowerCase() === "invalid" || String(health?.state || "").toLowerCase() === "disabled" || String(health?.state || "").toLowerCase() === "reauth") return "账号异常";
  if (String(quota?.status || "").toLowerCase() === "exhausted") return "额度耗尽";
  if (capability.available) return `可用 · ${formatGrokMediaQuota(quota)}`;
  return "待确认";
}

export function formatGrokDateTime(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const raw = String(value).trim();
  if (!raw) return "—";
  const numeric = Number(raw);
  const date =
    Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/** Soften probe noise when quota numbers are already present (reference UX). */
export function formatGrokRefreshHint(item: GrokAccount): string {
  const failed = String(item.refresh_status || "").toLowerCase() === "failed";
  if (!failed) return "";
  if (hasGrokQuotaData(item.quota)) {
    // Quota already shown — do not scare operators with "上游未返回".
    return "";
  }
  return String(item.refresh_error || "上游未返回真实额度数据").trim();
}

export function formatGrokPool(pool?: string): string {
  const p = String(pool || "").toLowerCase();
  if (p === "basic") return "Basic";
  if (p === "super") return "Super";
  if (p === "heavy") return "Heavy";
  if (p === "auto") return "Auto";
  return pool || "—";
}

export function formatGrokRuntimeStatus(status?: string | null, syncState?: string): string {
  const s = String(status || "").toLowerCase();
  if (!s) return syncState === "synced" ? "待刷新" : "未加入";
  if (s === "active") return "正常";
  if (s === "cooling" || s === "rate_limited") return "限流";
  if (s === "invalid" || s === "expired") return "异常";
  if (s === "disabled") return "禁用";
  return status || "—";
}

export async function listGrokAccounts(params?: {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: string;
}) {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.page_size) search.set("page_size", String(params.page_size));
  if (params?.keyword) search.set("keyword", params.keyword);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return httpRequest<GrokAccountsListResponse>(qs ? `/api/grok/accounts?${qs}` : "/api/grok/accounts");
}

export async function importGrokAccounts(payload: {
  tokens?: string[];
  text?: string;
  accounts?: Array<Record<string, unknown>>;
  source_type?: string;
}) {
  return httpRequest<{ added: number; skipped: number; errors?: Array<{ error: string }> }>("/api/grok/accounts", {
    method: "POST",
    body: payload,
  });
}

export async function deleteGrokAccounts(ids: string[]) {
  return httpRequest<{ deleted: number; removed?: number }>("/api/grok/accounts", {
    method: "DELETE",
    body: { ids },
  });
}

export async function setGrokAccountsDisabled(ids: string[], disabled: boolean) {
  return httpRequest<{ updated: number; disabled: boolean }>("/api/grok/accounts/disabled", {
    method: "POST",
    body: { ids, disabled },
  });
}

export async function refreshGrokAccountsRuntime(ids?: string[]) {
  return httpRequest<{
    summary?: { total?: number; ok?: number; fail?: number };
    results?: Array<{ id?: string; ok?: boolean; error?: string }>;
    error?: string;
  }>("/api/grok/accounts/runtime/refresh", {
    method: "POST",
    body: { ids: ids || [] },
  });
}

export async function syncGrokAccountsToRuntime() {
  return httpRequest<{ success?: boolean; added?: number; updated?: number; pool?: string }>(
    "/api/grok/accounts/sync",
    { method: "POST", body: {} },
  );
}

export async function exportGrokAccounts(format: "json" | "txt" = "json") {
  return httpRequest<{ items: GrokAccount[]; total: number } | string>(
    `/api/grok/accounts/export?format=${format}&include_sso=false`,
  );
}
