export type StorageBackendInfo = {
  type: string;
  description?: string;
  file_path?: string;
  file_exists?: boolean;
  auth_keys_file_path?: string;
  auth_keys_file_exists?: boolean;
  db_type?: string;
  database_url?: string;
};

export type StorageBackendHealth = {
  status: string;
  backend: string;
  error?: string;
  file_path?: string;
  file_exists?: boolean;
  auth_keys_file_path?: string;
  auth_keys_file_exists?: boolean;
  database_url?: string;
  account_count?: number;
  auth_key_count?: number;
  document_count?: number;
  log_count?: number;
};

export type SystemLog = {
  time: string;
  summary?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemLogFilters = {
  username?: string;
  module?: string;
  summary?: string;
  method?: string;
  status?: string;
  ip_address?: string;
  operation_type?: string;
  log_level?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  page_size?: number | string;
};

export type LogGovernanceSummary = { total: number; oldest_time?: string; latest_time?: string };
export type LogCleanupResult = { retention_days: number; cutoff_date: string; deleted: number; remaining: number };
