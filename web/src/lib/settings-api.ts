import { httpRequest } from "@/lib/request";
import { assertCursorPage } from "@/lib/api-contract";
import type { ImageProxyHealth, ImageVisibility, ManagedImage, MediaLocalCleanupStatus, MediaMigrationStatus, MediaStorageHealth, SettingsConfig } from "@/lib/api-types";

export async function fetchSettingsConfig(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", { signal: options.signal });
}

export type CreationPricing = Pick<
  SettingsConfig,
  | "image_credit_cost_1080p"
  | "gpt_image_2_credit_cost"
  | "gpt_image_2_5_credit_cost"
  | "gpt_image_2_5_flare_credit_cost"
  | "gpt_image_2_5_sunburst_credit_cost"
  | "image_credit_cost_2k"
  | "image_credit_cost_4k"
  | "grok_image_credit_cost_1k"
  | "grok_image_credit_cost_2k"
  | "video_credit_cost_per_second"
> & {
  image_provider?: "account_pool" | "proxy_api";
  image_default_model?: string;
};

export async function fetchCreationPricing(options: { signal?: AbortSignal } = {}) {
  return httpRequest<CreationPricing>("/api/creation-pricing", { signal: options.signal });
}

export async function updateSettingsConfig(settings: Partial<SettingsConfig>) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function saveLoginPageImageSettings(formData: FormData) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings/login-page-image", {
    method: "POST",
    body: formData,
  });
}

export async function fetchImageProxyModels(settings: { base_url: string; api_key: string }) {
  return httpRequest<{ models: string[] }>("/api/settings/image-proxy/models", {
    method: "POST",
    body: settings,
  });
}

export async function fetchImageProxyHealth() {
  return httpRequest<{ health: ImageProxyHealth }>("/api/settings/image-proxy/health");
}

export async function fetchMediaStorageOverview(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{
    health: MediaStorageHealth;
    migration: MediaMigrationStatus;
    cleanup: MediaLocalCleanupStatus;
    active_provider: "local" | "r2";
    configured_provider: "local" | "r2";
    restart_required: boolean;
  }>(
    "/api/admin/media-storage",
    { signal: options.signal },
  );
}

export async function testMediaStorageConnection(input: {
  account_id: string;
  access_key_id: string;
  secret_access_key?: string;
  bucket: string;
}) {
  return httpRequest<{ health: MediaStorageHealth }>("/api/admin/media-storage/test", {
    method: "POST",
    body: input,
  });
}

export async function fetchMediaMigrationStatus(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ migration: MediaMigrationStatus }>("/api/admin/media-storage/migration", {
    signal: options.signal,
  });
}

export async function triggerMediaMigration() {
  return httpRequest<{ migration: MediaMigrationStatus }>("/api/admin/media-storage/migration", {
    method: "POST",
  });
}

export async function fetchMediaLocalCleanupStatus(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ cleanup: MediaLocalCleanupStatus }>("/api/admin/media-storage/local-cleanup", {
    signal: options.signal,
  });
}

export async function triggerMediaLocalCleanup(mode: "verify" | "delete", confirmationToken = "") {
  return httpRequest<{ cleanup: MediaLocalCleanupStatus }>("/api/admin/media-storage/local-cleanup", {
    method: "POST",
    body: { mode, confirmation_token: confirmationToken },
  });
}

export type ManagedImageListFilters = {
  start_date?: string;
  end_date?: string;
  scope?: "mine" | "public" | "all";
  /** Page size; omit for legacy full list. */
  limit?: number;
  cursor?: string;
  /** Incremental refresh: only items updated after this stamp. */
  updated_after?: string;
};

export type ManagedImageListResult = {
  items: ManagedImage[];
  groups: Array<{ date: string; items: ManagedImage[] }>;
  total: number;
  has_more: boolean;
  next_cursor: string;
  limit: number;
};

export async function fetchManagedImages(
  filters: ManagedImageListFilters,
  options: { signal?: AbortSignal } = {},
): Promise<ManagedImageListResult> {
  const params = new URLSearchParams();
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.limit != null && filters.limit > 0) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.updated_after) params.set("updated_after", filters.updated_after);
  const data = await httpRequest<{
    items: ManagedImage[];
    groups: Array<{ date: string; items: ManagedImage[] }>;
    total: number;
    has_more: boolean;
    next_cursor: string;
    limit: number;
  }>(`/api/images${params.toString() ? `?${params.toString()}` : ""}`, { signal: options.signal });
  assertCursorPage<ManagedImage>(data, "图片库");
  if (!Array.isArray(data.groups)) throw new Error("图片库分组返回格式错误");
  return {
    items: data.items,
    groups: data.groups,
    total: data.total,
    has_more: data.has_more,
    next_cursor: data.next_cursor,
    limit: data.limit,
  };
}

export async function updateManagedImageVisibility(path: string, visibility: ImageVisibility) {
  return httpRequest<{ item: Partial<ManagedImage> & { path: string; visibility: ImageVisibility } }>(
    "/api/images/visibility",
    {
      method: "PATCH",
      body: { path, visibility },
    },
  );
}

export async function deleteManagedImages(paths: string[]) {
  return httpRequest<{ deleted: number; missing: number; paths: string[] }>("/api/images", {
    method: "DELETE",
    body: { paths },
  });
}
