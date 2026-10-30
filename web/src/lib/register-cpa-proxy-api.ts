import { httpRequest } from "@/lib/request";
import type { RegisterConfig } from "@/lib/api-types";
import type { PublicImageChannelModel } from "@/lib/image-channel-api";

export async function fetchRegisterConfig(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", { signal: options.signal });
}

export async function updateRegisterConfig(updates: Partial<RegisterConfig>) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", {
    method: "POST",
    body: updates,
  });
}

export async function startRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/start", { method: "POST" });
}

export async function stopRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/stop", { method: "POST" });
}

export async function resetRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/reset", { method: "POST" });
}

export async function resetOutlookPool(scope: "all" | "failed" | "unused" | "retryable" | "invalid" = "all") {
  return httpRequest<{ register: RegisterConfig }>("/api/register/outlook-pool/reset", {
    method: "POST",
    body: { scope },
  });
}

export async function clearCheckoutHistory() {
  return httpRequest<{ register?: RegisterConfig; removed?: number }>("/api/register/checkout-history/clear", {
    method: "POST",
    body: {},
  });
}

export async function stopCheckoutRetries() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/checkout-retries/stop", {
    method: "POST",
    body: {},
  });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools", { signal: options.signal });
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}

export type ClearanceTestResult = {
  ok: boolean;
  status: string;
  latency_ms: number;
  error?: string | null;
  target_url?: string;
  cookie_count?: number;
  has_user_agent?: boolean;
  proxy_url?: string;
  message?: string;
};

export async function testProxyClearance(targetUrl?: string) {
  return httpRequest<{ result: ClearanceTestResult }>("/api/proxy/clearance/test", {
    method: "POST",
    body: { target_url: targetUrl ?? "https://chatgpt.com" },
  });
}

export type ProxyRuntimeStatus = {
  enabled?: boolean;
  egress_mode?: string;
  has_proxy?: boolean;
  proxy_source?: string;
  clearance_enabled?: boolean;
  clearance_mode?: string;
  has_clearance_bundle?: boolean;
  cached_clearance_hosts?: string[];
  flaresolverr_url?: string;
  refresh_interval_sec?: number;
  bundle_created_at?: string;
  bundle_expires_at?: string;
  cookie_count?: number;
  has_user_agent?: boolean;
};

export type ProxyRuntimeSettings = {
  enabled?: boolean;
  egress_mode?: string;
  proxy_url?: string;
  clearance?: {
    enabled?: boolean;
    mode?: string;
    flaresolverr_url?: string;
    timeout_sec?: number;
    refresh_interval?: number;
    warm_up_on_start?: boolean;
  };
};

export async function fetchProxyRuntime() {
  return httpRequest<{ runtime: ProxyRuntimeSettings; status: ProxyRuntimeStatus }>("/api/proxy/runtime");
}

export async function warmUpProxyClearance() {
  return httpRequest<{ result: Record<string, unknown>; status: ProxyRuntimeStatus }>(
    "/api/proxy/clearance/warmup",
    { method: "POST", body: {} },
  );
}

export type ModelCatalogResponse = {
  object?: string;
  chat_models: string[];
  image_models: string[];
  image_edit_models?: string[];
  video_models?: string[];
  all_models?: string[];
  source?: { chat?: string; image?: string; grok?: string };
  openai_models_endpoint?: string;
  image_channel_models?: PublicImageChannelModel[];
};

export async function fetchModelCatalog() {
  return httpRequest<ModelCatalogResponse>("/api/model-catalog");
}
