import { httpRequest } from "@/lib/request";

export type GrokProvider = "build" | "web" | "console";
export type GrokProviderStatus = "active" | "disabled" | "error" | "unknown";

export type GrokProviderLink = {
  id: string;
  kind: "web_build" | "web_console";
  account_id: string;
  provider: GrokProvider;
  status: GrokProviderStatus;
};

export type GrokProviderAccount = {
  id: string;
  provider: GrokProvider;
  status: GrokProviderStatus;
  source_type: string;
  display_name: string;
  email_masked: string;
  credential_kind: string;
  has_credential: boolean;
  max_concurrent: number;
  egress: { mode: "inherit" | "direct" | "proxy"; identity: string; configured: boolean };
  capabilities: string[];
  metadata: Record<string, unknown>;
  source_created_at: string;
  source_updated_at: string;
  projected_at: string;
  links: GrokProviderLink[];
  quotas: Array<{
    capability: string;
    remaining: number | null;
    limit_value: number | null;
    reset_at: string;
    checked_at: string;
    status: string;
    metadata: Record<string, unknown>;
  }>;
};

export type GrokProviderAccountsResponse = {
  items: GrokProviderAccount[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    total: number;
    by_provider: Record<GrokProvider, number>;
    routable_by_provider: Record<GrokProvider, number>;
    by_status: Record<GrokProviderStatus, number>;
    with_credentials: number;
    linked: number;
    theoretical_slots: number;
    quota_exhausted: number;
    quota_unknown: number;
    recent_failure_codes: Record<string, number>;
  };
  projection: {
    status: "success" | "failed";
    account_count: number;
    link_count: number;
    quota_count: number;
    source_counts: Record<string, number>;
    warnings: string[];
    error_code: string;
    started_at: string;
    finished_at: string;
    sources: Record<string, string>;
    consistency: Record<string, number>;
  };
};

export type GrokProviderExportMode = "redacted" | "credentials";

export type GrokProviderExportResponse = {
  format: "grok-provider-accounts.v1";
  provider: GrokProvider;
  mode: GrokProviderExportMode;
  count: number;
  accounts: Array<Record<string, unknown>>;
};

export type GrokProviderDeletePreview = {
  provider: GrokProvider;
  root_ids: string[];
  linked_providers: GrokProvider[];
  linked_accounts: Array<{
    id: string;
    provider: GrokProvider;
    display_name: string;
    email_masked: string;
  }>;
  by_provider: Record<GrokProvider, number>;
  total: number;
  preview_token: string;
};

export type GrokProviderDeleteResult = {
  deleted: number;
  roots_deleted: number;
  linked_deleted: number;
  deleted_by_provider: Record<GrokProvider, number>;
  account_ids: string[];
};

export type GrokProviderConversionTask = {
  id: string;
  operation: "convert" | "import" | "status" | "concurrency" | "egress" | "quota" | "detect";
  target: GrokProvider;
  strategy: "missing" | "all" | "upsert" | "enable" | "disable" | "configure" | "inherit" | "direct" | "proxy" | "sync" | "probe";
  status: "queued" | "running" | "succeeded" | "failed";
  progress: { completed: number; total: number; percent: number };
  stages: Array<{ key: "import" | "provider_quota" | "console_conversion" | "console_quota" | string; status: "queued" | "running" | "succeeded" | "failed"; completed: number; total: number; percent: number }>;
  result: { created?: number; updated?: number; skipped?: number; succeeded?: number; invalid?: number; failed?: number; account_ids?: string[]; console_account_ids?: string[]; stages?: Array<{ key: string; result: Record<string, unknown> }>; failures?: Array<{ web_account_id?: string; account_id?: string; code: string }>; items?: Array<{ account_id: string; outcome: "ok" | "invalid" | "failed"; code: string; status_code: number }> };
  error: { code: string; message: string } | null;
  created_at: string;
  started_at: string;
  finished_at: string;
};

export function listGrokProviderAccounts(
  params: {
    page?: number;
    page_size?: number;
    provider?: GrokProvider | "all";
    status?: GrokProviderStatus | "all";
    keyword?: string;
  } = {},
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  if (params.provider && params.provider !== "all") search.set("provider", params.provider);
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.keyword) search.set("keyword", params.keyword);
  const query = search.toString();
  return httpRequest<GrokProviderAccountsResponse>(
    query ? `/api/grok/provider-accounts?${query}` : "/api/grok/provider-accounts",
    { signal },
  );
}

export function createGrokProviderConversionTask(
  target: "build" | "console",
  strategy: "missing" | "all" = "missing",
  accountIds?: string[],
) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "convert", target, strategy, account_ids: accountIds },
  });
}

export function createGrokProviderImportTask(
  target: GrokProvider,
  document: string,
  options: { autoSyncQuota: boolean; convertToConsole: boolean },
) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: {
      operation: "import", target, document,
      auto_sync_quota: options.autoSyncQuota,
      convert_to_console: options.convertToConsole,
    },
  });
}

export function createGrokProviderStatusTask(target: GrokProvider, accountIds: string[], enabled: boolean) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "status", target, account_ids: accountIds, enabled },
  });
}

export function createGrokProviderConcurrencyTask(target: GrokProvider, accountIds: string[], maxConcurrent: number) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "concurrency", target, account_ids: accountIds, max_concurrent: maxConcurrent },
  });
}

export function createGrokProviderEgressTask(
  target: GrokProvider,
  accountIds: string[],
  mode: "inherit" | "direct" | "proxy",
  proxyUrl = "",
) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "egress", target, account_ids: accountIds, egress_mode: mode, proxy_url: proxyUrl },
  });
}

export function createGrokProviderQuotaTask(target: GrokProvider, accountIds: string[]) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "quota", target, account_ids: accountIds },
  });
}

export function createGrokProviderDetectionTask(target: GrokProvider, accountIds: string[]) {
  return httpRequest<{ task: GrokProviderConversionTask; reused: boolean }>("/api/grok/provider-account-tasks", {
    method: "POST",
    body: { operation: "detect", target, account_ids: accountIds },
  });
}

export function exportGrokProviderAccounts(
  provider: GrokProvider,
  accountIds: string[],
  mode: GrokProviderExportMode = "redacted",
) {
  return httpRequest<GrokProviderExportResponse>("/api/grok/provider-account-exports", {
    method: "POST",
    body: { provider, account_ids: accountIds, mode },
  });
}

export function previewGrokProviderAccountDeletion(
  provider: GrokProvider,
  accountIds: string[],
  linkedProviders: GrokProvider[],
) {
  return httpRequest<GrokProviderDeletePreview>("/api/grok/provider-account-deletions/preview", {
    method: "POST",
    body: { provider, account_ids: accountIds, linked_providers: linkedProviders },
  });
}

export function deleteGrokProviderAccounts(preview: GrokProviderDeletePreview) {
  return httpRequest<GrokProviderDeleteResult>("/api/grok/provider-accounts", {
    method: "DELETE",
    body: {
      provider: preview.provider,
      account_ids: preview.root_ids,
      linked_providers: preview.linked_providers,
      preview_token: preview.preview_token,
    },
  });
}

export function getGrokProviderConversionTask(taskId: string, signal?: AbortSignal) {
  return httpRequest<{ task: GrokProviderConversionTask }>(
    `/api/grok/provider-account-tasks/${encodeURIComponent(taskId)}`,
    { signal },
  );
}

export function listActiveGrokProviderConversionTasks(signal?: AbortSignal) {
  return httpRequest<{ items: GrokProviderConversionTask[] }>("/api/grok/provider-account-tasks/active", { signal });
}
