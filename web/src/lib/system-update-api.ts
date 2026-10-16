import { httpRequest } from "@/lib/request";

export type SystemReleaseInfo = {
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: Array<{ name: string; download_url: string; size: number }>;
};

export type SystemUpdateStatus = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_info?: SystemReleaseInfo;
  cached: boolean;
  warning?: string;
  build_type: string;
  deployment: string;
  repository: string;
  automatic_update_supported: boolean;
  support_reason?: string;
};

export type SystemVersionResponse = {
  version: string;
  version_info: {
    version: string;
    commit: string;
    date: string;
    build_type: string;
    deployment: string;
  };
  update_status: SystemUpdateStatus;
};

export type HostUpdaterCheck = {
  name: string;
  status: "passed" | "failed";
  detail?: string;
};

export type HostUpdaterState = {
  task_id?: string;
  status: "idle" | "preflight" | "ready" | "failed";
  phase?: string;
  started_at?: string;
  finished_at?: string;
  updated_at: string;
  error?: string;
  checks: HostUpdaterCheck[];
};

export type HostUpdaterStatus = {
  configured: boolean;
  connected: boolean;
  reason?: string;
  state?: HostUpdaterState;
};

export type HostUpdaterPreflight = {
  configured: boolean;
  connected: boolean;
  result: { state: HostUpdaterState; started: boolean };
};

export function fetchSystemVersion(signal?: AbortSignal) {
  return httpRequest<SystemVersionResponse>("/api/admin/system/version", { signal });
}

export function checkSystemUpdates(signal?: AbortSignal) {
  return httpRequest<SystemUpdateStatus>("/api/admin/system/check-updates?force=true", { signal });
}

export function fetchHostUpdaterStatus(signal?: AbortSignal) {
  return httpRequest<HostUpdaterStatus>("/api/admin/system/update-status", { signal });
}

export function startHostUpdaterPreflight() {
  return httpRequest<HostUpdaterPreflight>("/api/admin/system/update-preflight", { method: "POST" });
}
