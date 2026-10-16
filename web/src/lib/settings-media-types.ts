export type MediaStorageHealth = {
  provider: "local" | "r2" | string;
  status: "ok" | "error" | "unconfigured" | string;
  error?: string;
};

export type MediaMigrationStatus = {
  state: "idle" | "running" | "succeeded" | "failed" | string;
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  pending: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  error?: string;
};

export type MediaLocalCleanupStatus = {
  state: "idle" | "running" | "succeeded" | "failed" | string;
  mode: "verify" | "delete" | string;
  total: number;
  processed: number;
  eligible: number;
  verified: number;
  skipped: number;
  failed: number;
  removed_files: number;
  reclaimable_bytes: number;
  freed_bytes: number;
  confirmation_token?: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
};
