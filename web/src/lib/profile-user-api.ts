import type { LoginResponse, ProfileApiKeyRateLimits, UserKey } from "@/lib/api-types";
import { httpRequest } from "@/lib/request";

function profileAPIKeyPath(keyId: string) {
  return `/api/profile/api-key/${encodeURIComponent(keyId)}`;
}

export async function fetchProfileAPIKey() {
  return httpRequest<{ items: UserKey[]; rate_limits?: ProfileApiKeyRateLimits }>("/api/profile/api-key");
}

export async function upsertProfileAPIKey(name: string) {
  return httpRequest<{
    item: UserKey;
    key: string;
    items: UserKey[];
    rate_limits?: ProfileApiKeyRateLimits;
  }>("/api/profile/api-key", { method: "POST", body: { name } });
}

export async function updateProfileAPIKey(
  keyId: string,
  updates: { enabled?: boolean; name?: string }
) {
  return httpRequest<{
    item: UserKey;
    items: UserKey[];
    rate_limits?: ProfileApiKeyRateLimits;
  }>(profileAPIKeyPath(keyId), { method: "POST", body: updates });
}

export async function deleteProfileAPIKey(keyId: string) {
  return httpRequest<{ items: UserKey[]; rate_limits?: ProfileApiKeyRateLimits }>(
    profileAPIKeyPath(keyId),
    { method: "DELETE" }
  );
}

export async function testProfileAPIKeyConnectivity(rawKey?: string) {
  const startedAt = performance.now();
  const headers: Record<string, string> = {};
  if (rawKey && rawKey.trim()) {
    headers["Authorization"] = `Bearer ${rawKey.trim()}`;
  }
  const response = await httpRequest<{
    object?: string;
    data?: Array<{ id?: string }>;
  }>("/v1/models", {
    method: "GET",
    headers,
    redirectOnUnauthorized: false,
  });
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
  const models = Array.isArray(response?.data)
    ? response.data
        .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
        .filter(Boolean)
    : [];
  return {
    latencyMs,
    modelCount: models.length,
    sampleModels: models.slice(0, 6),
  };
}

export async function updateProfileName(name: string) {
  return httpRequest<LoginResponse>("/api/profile", {
    method: "POST",
    body: { name },
  });
}

export async function changeProfilePassword(
  currentPassword: string,
  newPassword: string
) {
  return httpRequest<{ ok: boolean }>("/api/profile/password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
