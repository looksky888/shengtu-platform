import type { CreationTask, CreationTaskListResponse, ImageTaskLogFilters } from "@/lib/api-types";
import { assertItemsResponse } from "@/lib/api-contract";
import { httpRequest } from "@/lib/request";

export type ImageTaskTodayStats = {
  date: string;
  period?: "day" | "week" | "month" | "today" | string;
  start_date?: string;
  end_date?: string;
  success_tasks: number;
  failed_tasks: number;
  success_images: number;
  failed_images: number;
  updated_at: string;
};

/** Admin today stats (requires RBAC 查看生图统计). Prefer period query via fetchImageTaskStats. */
export async function fetchImageTaskTodayStats(options: { signal?: AbortSignal } = {}) {
  const data = await httpRequest<{ stats: ImageTaskTodayStats }>("/api/admin/image-task-stats/today", {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: options.signal,
  });
  return data.stats;
}

/** Studio FAB: same ledger-backed daily stats as settings, any logged-in user. */
export async function fetchStudioImageTaskTodayStats(options: { signal?: AbortSignal } = {}) {
  const data = await httpRequest<{ stats: ImageTaskTodayStats }>("/api/image-task-stats/today", {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: options.signal,
  });
  return data.stats;
}

export async function fetchImageTaskStats(
  options: { period?: "day" | "week" | "month"; date?: string; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams();
  if (options.period) params.set("period", options.period);
  if (options.date) params.set("date", options.date);
  const data = await httpRequest<{ stats: ImageTaskTodayStats }>(
    `/api/admin/image-task-stats${params.toString() ? `?${params.toString()}` : ""}`,
    {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      signal: options.signal,
    },
  );
  return data.stats;
}

export async function cancelAdminImageTask(taskId: string) {
  return httpRequest<CreationTask>(`/api/admin/image-task-logs/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

export async function batchCancelAdminImageTasks(ids: string[]) {
  return httpRequest<{ cancelled: number; errors: Array<{ id: string; error: string }> }>(
    "/api/admin/image-task-logs/batch-cancel",
    { method: "POST", body: { ids } },
  );
}

/** Clear terminal tasks from admin queue. Does not remove running/queued. */
export async function clearAdminImageTasks(scope: "finished" | "failed" | "success" | "cancelled" = "finished") {
  return httpRequest<{
    removed: number;
    remaining: number;
    scope: string;
    by_status?: Record<string, number>;
  }>("/api/admin/image-task-logs/clear", {
    method: "POST",
    body: { scope },
  });
}

export type AccountDisposeMetrics = {
  day?: string;
  deleted_permanent?: number;
  marked_invalid?: number;
  quarantine_write_failed?: number;
  refresh_recovered?: number;
  quarantined_temporary?: number;
  cooled_temporary?: number;
  soft_fail_unknown?: number;
  auto_restored_temporary?: number;
  manual_restored?: number;
  total_actions?: number;
  /** 0–1 share of actions that hard-deleted */
  delete_share?: number;
  /** 0–1 recovered among permanent outcomes */
  recover_share?: number;
  /** 0–1 cabin write fail among hard-delete attempts */
  quarantine_fail_share?: number;
};

export type AccountPoolHealth = {
  total?: number;
  available?: number;
  /** Free concurrent image slots (sum of per-account capacity minus in-flight). */
  free_slots?: number;
  locked?: number;
  cooling?: number;
  invalid?: number;
  disabled?: number;
  rate_limited?: number;
  schedule?: string;
  ops_day?: string;
  ops?: Record<string, number>;
  /** Structured today-China disposal metrics (preferred over raw ops). */
  dispose?: AccountDisposeMetrics;
  quarantine_count?: number;
  quarantine_max?: number;
  updated_at?: string;
};

/** Public health probe (no auth). Used for pre-submit slot hints. */
export async function fetchPublicPoolFreeSlots(): Promise<number | null> {
  try {
    const data = await httpRequest<{ account_pool?: { free_slots?: number; available?: number } }>("/health", {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });
    const slots = data?.account_pool?.free_slots;
    if (typeof slots === "number" && Number.isFinite(slots)) return Math.max(0, Math.floor(slots));
    const available = data?.account_pool?.available;
    if (typeof available === "number" && Number.isFinite(available)) return Math.max(0, Math.floor(available));
    return null;
  } catch {
    return null;
  }
}

export type QuarantineItem = {
  email?: string;
  token_hash?: string;
  reason?: string;
  source?: string;
  grade?: string;
  removed_at?: string;
  has_token?: boolean;
};

export type QuarantineListResponse = {
  items: QuarantineItem[];
  total: number;
  temporary_count: number;
  permanent_count: number;
  other_count?: number;
  grade_filter?: string;
};

export async function fetchAccountPoolHealth(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{
    pool: AccountPoolHealth;
    quarantine: QuarantineItem[];
    temporary_count?: number;
    permanent_count?: number;
    quarantine_total?: number;
  }>("/api/admin/account-pool/health", {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: options.signal,
  });
}

export async function fetchQuarantineList(
  grade?: "temporary" | "permanent" | "all",
  options: { signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams();
  if (grade && grade !== "all") params.set("grade", grade);
  const qs = params.toString();
  return httpRequest<QuarantineListResponse>(`/api/admin/account-quarantine${qs ? `?${qs}` : ""}`, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: options.signal,
  });
}

export async function restoreQuarantineAccount(tokenHash: string) {
  return httpRequest<{ restored: boolean; error?: string; email?: string; token_hash?: string }>(
    "/api/admin/account-quarantine",
    { method: "POST", body: { token_hash: tokenHash } },
  );
}

/** Permanent cabin: remove record without re-importing to the pool. */
export async function purgePermanentQuarantineAccount(tokenHash: string) {
  return httpRequest<{ purged: boolean; error?: string; email?: string; token_hash?: string; grade?: string }>(
    `/api/admin/account-quarantine?token_hash=${encodeURIComponent(tokenHash)}`,
    { method: "DELETE" },
  );
}

export async function purgeAllPermanentQuarantineAccounts() {
  return httpRequest<{ requested: number; purged: number; failed: number; errors?: string[] }>(
    "/api/admin/account-quarantine?all=true&grade=permanent",
    { method: "DELETE" },
  );
}

export async function fetchAdminImageTaskLogs(
  filters: ImageTaskLogFilters = {},
  options: { signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }
  const data = await httpRequest<{ items: CreationTask[]; total: number; executors: import("./image-task-types").TaskExecutorsSnapshot }>(
    `/api/admin/image-task-logs${params.toString() ? `?${params.toString()}` : ""}`,
    {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      signal: options.signal,
    },
  );
  assertItemsResponse<CreationTask>(data, "任务日志");
  if (!Number.isFinite(data.total) || !data.executors) {
    throw new Error("任务日志返回格式错误");
  }
  return { items: data.items, total: data.total, executors: data.executors };
}

export async function fetchRecentCreationTasks(options: { limit?: number; status?: "active" | "all" } = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.status) params.set("status", options.status);
  return fetchCreationTaskList(params);
}

export async function fetchCreationTasks(ids: string[]) {
  const params = new URLSearchParams();
  if (ids.length > 0) params.set("ids", ids.join(","));
  return fetchCreationTaskList(params);
}

async function fetchCreationTaskList(params: URLSearchParams) {
  const query = params.toString();
  const data = await httpRequest<CreationTaskListResponse>(`/api/creation-tasks${query ? `?${query}` : ""}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  assertItemsResponse<CreationTask>(data, "创作任务");
  if (!Array.isArray(data.missing_ids)) {
    throw new Error("创作任务返回格式错误");
  }
  return data;
}

export async function cancelCreationTask(clientTaskId: string) {
  return httpRequest<CreationTask>(`/api/creation-tasks/${encodeURIComponent(clientTaskId)}/cancel`, {
    method: "POST",
    body: {},
  });
}
