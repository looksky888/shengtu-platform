import { httpRequest } from "@/lib/request";

export type GrokOAuthAccount = {
  id: string;
  email?: string;
  status?: string;
  disabled?: boolean;
  models?: string[];
  subject?: string;
  subject_preview?: string;
  source_type?: string;
  has_access_token?: boolean;
  has_refresh_token?: boolean;
  token_type?: string;
  expires_at?: string | number | null;
  last_refresh_at?: string | number | null;
  use_count?: number;
  fail_count?: number;
  last_error?: string;
  updated_at?: string | number | null;
  created_at?: string | number | null;
  [key: string]: unknown;
};

export type GrokOAuthAccountsResponse = {
  provider?: string;
  items: GrokOAuthAccount[];
  total?: number;
  available_models?: string[];
};

export type GrokOAuthProtocolJob = {
  id?: string;
  status?: string;
  stage?: string;
  message?: string;
  error?: string;
  source_account_id?: string;
  models?: string[];
  account?: GrokOAuthAccount | null;
  created_at?: number;
  updated_at?: number;
  delivery?: Record<string, { status?: string; target_id?: string; error?: string }>;
  [key: string]: unknown;
};

export type GrokOAuthDeviceSession = {
  id: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_at: number;
  interval: number;
  status?: string;
};

export type GrokOAuthDevicePollResult =
  | { status: "pending"; interval?: number; expires_at?: number }
  | { status: "authorized"; account?: GrokOAuthAccount; models?: string[] }
  | { status: string; [key: string]: unknown };

export type GrokOAuthImportRequest = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  email?: string;
  subject?: string;
  credential?: Record<string, unknown>;
};

export type GrokOAuthAccountTestResponse = {
  account_id?: string;
  account?: GrokOAuthAccount;
  model?: string;
  content?: string;
  elapsed_ms?: number;
};

export async function listGrokOAuthAccounts(params?: { keyword?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.keyword) search.set("keyword", params.keyword);
  if (params?.status) search.set("status", params.status || "all");
  const query = search.toString();
  return httpRequest<GrokOAuthAccountsResponse>(
    query ? `/api/grok/oauth/accounts?${query}` : "/api/grok/oauth/accounts",
  );
}

export async function startGrokOAuthProtocol(accountId?: string) {
  return httpRequest<{ reused?: boolean; job?: GrokOAuthProtocolJob }>("/api/grok/oauth/protocol/start", {
    method: "POST",
    body: { account_id: accountId || "" },
  });
}

export async function getGrokOAuthProtocolJob(jobId: string) {
  return httpRequest<{ job: GrokOAuthProtocolJob }>(`/api/grok/oauth/protocol/jobs/${encodeURIComponent(jobId)}`);
}

export async function refreshGrokOAuthAccount(oauthAccountId: string) {
  return httpRequest<Record<string, unknown>>(
    `/api/grok/oauth/accounts/${encodeURIComponent(oauthAccountId)}/refresh`,
    { method: "POST", body: {} },
  );
}

export async function syncGrokOAuthModels(oauthAccountId: string) {
  return httpRequest<Record<string, unknown>>(
    `/api/grok/oauth/accounts/${encodeURIComponent(oauthAccountId)}/models/sync`,
    { method: "POST", body: {} },
  );
}

export async function setGrokOAuthAccountsDisabled(ids: string[], disabled: boolean) {
  return httpRequest<{ updated?: number; disabled: boolean }>("/api/grok/oauth/accounts/status", {
    method: "POST",
    body: { ids, disabled },
  });
}

export async function deleteGrokOAuthAccounts(ids: string[]) {
  return httpRequest<{ deleted?: number; removed?: number }>("/api/grok/oauth/accounts", {
    method: "DELETE",
    body: { ids },
  });
}

export async function importGrokOAuthCredential(payload: GrokOAuthImportRequest) {
  return httpRequest<{ account?: GrokOAuthAccount; models?: string[] }>("/api/grok/oauth/accounts/import", {
    method: "POST",
    body: payload,
  });
}

export async function startGrokOAuthDevice() {
  return httpRequest<GrokOAuthDeviceSession>("/api/grok/oauth/device/start", { method: "POST", body: {} });
}

export async function pollGrokOAuthDevice(sessionId: string) {
  return httpRequest<GrokOAuthDevicePollResult>("/api/grok/oauth/device/poll", {
    method: "POST",
    body: { session_id: sessionId },
  });
}

export async function testGrokOAuthAccount(oauthAccountId: string, payload: { model: string; prompt: string }) {
  return httpRequest<GrokOAuthAccountTestResponse>(
    `/api/grok/oauth/accounts/${encodeURIComponent(oauthAccountId)}/test`,
    { method: "POST", body: payload },
  );
}
