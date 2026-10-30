import { httpRequest } from "@/lib/request";
import { assertOffsetPage } from "@/lib/api-contract";
import type {
  ApiPermission,
  CreateManagedUserPayload,
  ManagedRole,
  ManagedUser,
  ManagedUserUsage,
  PermissionMenu,
} from "@/lib/api-types";

function managedUserPath(userId: string) {
  return `/api/admin/users/${encodeURIComponent(userId)}`;
}

export type ManagedUsersQuery = {
  page?: number;
  page_size?: number;
  keyword?: string;
  provider?: string;
  status?: string;
  start_at?: string;
  end_at?: string;
  /** Preset: inactive >= 15d OR credit <= 0 */
  cleanup?: "inactive15_or_credit0";
  inactive_days_min?: number;
  credit_max?: number;
  /** When both inactive and credit filters set: or (default) | and */
  match?: "or" | "and";
};

export type ManagedUsersPage = {
  items: ManagedUser[];
  total: number;
  page: number;
  page_size: number;
  /** Always false on list (scheme B); usage is loaded via fetchManagedUsersUsage. */
  usage_ready?: boolean;
};

export type ManagedUserUsageSummary = ManagedUserUsage;

export type ManagedUsersUsageResponse = {
  ready: boolean;
  days: number;
  items: Record<string, ManagedUserUsage>;
};

export async function fetchManagedUsers(query: ManagedUsersQuery = {}, options: { signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (query.page && query.page > 0) params.set("page", String(query.page));
  if (query.page_size && query.page_size > 0) params.set("page_size", String(query.page_size));
  if (query.keyword?.trim()) params.set("keyword", query.keyword.trim());
  if (query.provider?.trim() && query.provider !== "all") params.set("provider", query.provider.trim());
  if (query.status?.trim() && query.status !== "all") params.set("status", query.status.trim());
  if (query.start_at?.trim()) params.set("start_at", query.start_at.trim());
  if (query.end_at?.trim()) params.set("end_at", query.end_at.trim());
  if (query.cleanup) params.set("cleanup", query.cleanup);
  if (typeof query.inactive_days_min === "number" && query.inactive_days_min > 0) {
    params.set("inactive_days_min", String(query.inactive_days_min));
  }
  if (typeof query.credit_max === "number") {
    params.set("credit_max", String(query.credit_max));
  }
  if (query.match) params.set("match", query.match);
  const qs = params.toString();
  const result = await httpRequest<ManagedUsersPage>(qs ? `/api/admin/users?${qs}` : "/api/admin/users", {
    signal: options.signal,
  });
  assertOffsetPage<ManagedUser>(result, "用户列表");
  return result;
}

/** On-demand usage for the current page. Never called by list open. */
export async function fetchManagedUsersUsage(
  userIds: string[],
  options: { days?: number; signal?: AbortSignal } = {},
) {
  const ids = userIds.map((id) => id.trim()).filter(Boolean).slice(0, 100);
  const params = new URLSearchParams();
  params.set("ids", ids.join(","));
  if (options.days && options.days > 0) params.set("days", String(options.days));
  return httpRequest<ManagedUsersUsageResponse>(`/api/admin/users/usage?${params.toString()}`, {
    signal: options.signal,
  });
}

export async function fetchPermissionCatalog() {
  return httpRequest<{ menus: PermissionMenu[]; apis: ApiPermission[] }>("/api/admin/permissions");
}

function managedRolePath(roleId: string) {
  return `/api/admin/roles/${encodeURIComponent(roleId)}`;
}

export async function fetchManagedRoles() {
  return httpRequest<{ items: ManagedRole[] }>("/api/admin/roles");
}

export async function createManagedRole(updates: {
  name: string;
  description?: string;
  menu_paths?: string[];
  api_permissions?: string[];
}) {
  return httpRequest<{ item: ManagedRole; items: ManagedRole[] }>("/api/admin/roles", {
    method: "POST",
    body: updates,
  });
}

export async function updateManagedRole(
  roleId: string,
  updates: { name?: string; description?: string; menu_paths?: string[]; api_permissions?: string[] },
) {
  return httpRequest<{ item: ManagedRole; items: ManagedRole[] }>(managedRolePath(roleId), {
    method: "POST",
    body: updates,
  });
}

export async function deleteManagedRole(roleId: string) {
  return httpRequest<{ items: ManagedRole[] }>(managedRolePath(roleId), { method: "DELETE" });
}

export async function createManagedUser(payload: CreateManagedUserPayload) {
  return httpRequest<{ item: ManagedUser }>("/api/admin/users", {
    method: "POST",
    body: payload,
  });
}

export async function updateManagedUser(
  userId: string,
  updates: { enabled?: boolean; name?: string; role_id?: string },
) {
  return httpRequest<{ item: ManagedUser }>(managedUserPath(userId), {
    method: "POST",
    body: updates,
  });
}

export type DeleteManagedUserOptions = {
  /** When deleting from cleanup-filtered list, pass filters for audit accountability. */
  cleanup?: string;
  inactive_days_min?: number;
  credit_max?: number;
  reason?: string;
};

export async function deleteManagedUser(userId: string, options?: DeleteManagedUserOptions) {
  const params = new URLSearchParams();
  if (options?.cleanup) params.set("cleanup", options.cleanup);
  if (typeof options?.inactive_days_min === "number" && options.inactive_days_min > 0) {
    params.set("inactive_days_min", String(options.inactive_days_min));
  }
  if (typeof options?.credit_max === "number") {
    params.set("credit_max", String(options.credit_max));
  }
  if (options?.reason?.trim()) params.set("reason", options.reason.trim().slice(0, 200));
  const qs = params.toString();
  const path = qs ? `${managedUserPath(userId)}?${qs}` : managedUserPath(userId);
  return httpRequest<{ deleted_id: string }>(path, { method: "DELETE" });
}
