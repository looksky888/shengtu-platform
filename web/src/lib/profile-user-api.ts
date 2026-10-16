import type { LoginResponse, UserKey } from "@/lib/api-types";
import { httpRequest } from "@/lib/request";

export async function fetchUserKeys() { return httpRequest<{ items: UserKey[] }>("/api/auth/users"); }
export async function createUserKey(name: string) { return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", { method: "POST", body: { name } }); }
export async function revealUserKey(keyId: string) { return httpRequest<{ key: string }>(`/api/auth/users/${keyId}/key`); }
export async function updateUserKey(keyId: string, updates: { enabled?: boolean; name?: string }) { return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, { method: "POST", body: updates }); }
export async function deleteUserKey(keyId: string) { return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, { method: "DELETE" }); }

function profileAPIKeyPath(keyId: string) { return `/api/profile/api-key/${encodeURIComponent(keyId)}`; }
export async function fetchProfileAPIKey() { return httpRequest<{ items: UserKey[] }>("/api/profile/api-key"); }
export async function upsertProfileAPIKey(name: string) { return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/profile/api-key", { method: "POST", body: { name } }); }
export async function revealProfileAPIKey(keyId: string) { return httpRequest<{ key: string }>(`${profileAPIKeyPath(keyId)}/key`); }
export async function updateProfileAPIKey(keyId: string, updates: { enabled?: boolean; name?: string }) { return httpRequest<{ item: UserKey; items: UserKey[] }>(profileAPIKeyPath(keyId), { method: "POST", body: updates }); }
export async function deleteProfileAPIKey(keyId: string) { return httpRequest<{ items: UserKey[] }>(profileAPIKeyPath(keyId), { method: "DELETE" }); }
export async function updateProfileName(name: string) { return httpRequest<LoginResponse>("/api/profile", { method: "POST", body: { name } }); }
export async function changeProfilePassword(currentPassword: string, newPassword: string) { return httpRequest<{ ok: boolean }>("/api/profile/password", { method: "POST", body: { current_password: currentPassword, new_password: newPassword } }); }
