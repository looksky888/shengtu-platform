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

export function fetchSystemVersion(signal?: AbortSignal) {
  return httpRequest<SystemVersionResponse>("/api/admin/system/version", { signal });
}

export function checkSystemUpdates(signal?: AbortSignal) {
  return httpRequest<SystemUpdateStatus>("/api/admin/system/check-updates?force=true", { signal });
}
