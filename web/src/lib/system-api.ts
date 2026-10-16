import { httpRequest } from "@/lib/request";
import type { LogCleanupResult, LogGovernanceSummary, SystemLog, SystemLogFilters } from "@/lib/api-types";

export async function fetchSystemLogs(filters: SystemLogFilters, options: { signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === "all") {
      continue;
    }
    params.set(key, String(value));
  }
  return httpRequest<{ items: SystemLog[] }>(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`, {
    signal: options.signal,
  });
}

export async function fetchLogGovernance(options: { signal?: AbortSignal } = {}) {
  return httpRequest<{ governance: LogGovernanceSummary }>("/api/logs/governance", { signal: options.signal });
}

export async function cleanupLogs(retentionDays: number) {
  return httpRequest<{ cleanup: LogCleanupResult; governance: LogGovernanceSummary }>("/api/logs/governance", {
    method: "POST",
    body: { retention_days: retentionDays },
  });
}

export type BackupConfig = {
  enabled?: boolean;
  provider?: string;
  local_dir?: string;
  interval_minutes?: number;
  include?: string[];
  last_max_files?: number;
  r2_account_id?: string;
  r2_access_key_id?: string;
  /** Write-only on save; never returned by GET (use configured flag). */
  r2_secret_access_key?: string;
  r2_secret_access_key_configured?: boolean;
  r2_bucket?: string;
  r2_prefix?: string;
};

export type BackupState = {
	status: "idle" | "running" | "success" | "failed";
	task_id?: string;
	phase?: string;
	started_at?: string | null;
	finished_at?: string | null;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error?: string;
  last_size?: number;
  last_file?: string;
  last_file_name?: string;
  last_file_count?: number;
  last_duration_ms?: number;
  provider?: string;
  remote_key?: string;
  remote_url?: string;
  updated_at?: string | null;
};

export type BackupRunResult = {
	state: BackupState;
	started: boolean;
	error?: string;
};

export async function fetchBackupConfig(options: { signal?: AbortSignal } = {}) {
	return httpRequest<{ config: BackupConfig; state?: BackupState }>("/api/admin/backup/config", { signal: options.signal });
}

export async function updateBackupConfig(config: Partial<BackupConfig>) {
  return httpRequest<{ config: BackupConfig; state?: BackupState }>("/api/admin/backup/config", {
    method: "POST",
    body: config,
  });
}

export async function runBackup() {
	return httpRequest<BackupRunResult>("/api/admin/backup/run", {
		method: "POST",
		body: {},
	});
}

export async function fetchBackupRunStatus(options: { signal?: AbortSignal } = {}) {
	return httpRequest<BackupRunResult>("/api/admin/backup/run", { signal: options.signal });
}
