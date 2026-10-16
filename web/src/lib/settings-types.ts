import type { LoginPageImageMode } from "@/lib/login-page-image-layout";
import type { ImageVisibility } from "@/lib/api-models";

export type { MediaLocalCleanupStatus, MediaMigrationStatus, MediaStorageHealth } from "@/lib/settings-media-types";
export type { ImageProxyHealth, ImageProxyHealthCore, ImageProxyHealthEvent, ImageProxyModelHealth } from "@/lib/settings-proxy-types";
export type { LogCleanupResult, LogGovernanceSummary, StorageBackendHealth, StorageBackendInfo, SystemLog, SystemLogFilters } from "@/lib/settings-system-types";

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  registration_enabled?: boolean;
  refresh_account_interval_minute?: number | string;
  image_concurrent_limit?: number | string;
  image_worker_count?: number | string;
  image_queue_capacity?: number | string;
  video_worker_count?: number | string;
  video_queue_capacity?: number | string;
  image_account_concurrency?: number | string;
  image_account_schedule?: "least_loaded" | "least_fail" | "quota_aware" | string;
  image_parallel_generation?: number | string | boolean;
  image_task_timeout_seconds?: number | string;
  image_default_model?: string;
  image_internal_model_slug?: string;
  image_fallback_model_enabled?: boolean;
  image_fallback_model_slugs?: string[];
  image_provider?: "account_pool" | "proxy_api" | string;
  image_proxy_base_url?: string;
  /** Write-only on save; never returned by GET (use configured/masked). */
  image_proxy_api_key?: string;
  image_proxy_api_key_configured?: boolean;
  image_proxy_api_key_masked?: string;
  image_proxy_model?: string;
  image_proxy_models?: string[];
  image_proxy_timeout_seconds?: number | string;
  image_proxy_max_retries?: number | string;
  image_proxy_download_urls?: boolean;
  image_credit_cost_4k?: number | string;
  image_credit_cost_2k?: number | string;
  image_credit_cost_1080p?: number | string;
  gpt_image_2_credit_cost?: number | string;
  gpt_image_2_5_credit_cost?: number | string;
  gpt_image_2_5_flare_credit_cost?: number | string;
  gpt_image_2_5_sunburst_credit_cost?: number | string;
  grok_image_credit_cost_1k?: number | string;
  grok_image_credit_cost_2k?: number | string;
  video_credit_cost_per_second?: number | string;
  user_default_concurrent_limit?: number | string;
  user_default_rpm_limit?: number | string;
  api_key_default_rpm_limit?: number | string;
  api_key_default_concurrent_limit?: number | string;
  api_key_daily_request_limit?: number | string;
  image_retention_days?: number | string;
  media_storage_provider?: "local" | "r2" | string;
  media_auto_cleanup_enabled?: boolean;
  media_r2_account_id?: string;
  media_r2_access_key_id?: string;
  /** Write-only on save; never returned by GET. */
  media_r2_secret_access_key?: string;
  media_r2_secret_access_key_configured?: boolean;
  media_r2_bucket?: string;
  media_r2_prefix?: string;
  media_r2_presign_ttl_seconds?: number | string;
  video_retention_days?: number | string;
  log_retention_days?: number | string;
  auto_remove_invalid_accounts?: boolean;
  auto_remove_rate_limited_accounts?: boolean;
  log_levels?: string[];
  canvas_url?: string;
  login_page_image_url?: string;
  login_page_image_mode?: LoginPageImageMode | string;
  login_page_image_zoom?: number | string;
  login_page_image_position_x?: number | string;
  login_page_image_position_y?: number | string;
  /** FlareSolverr base URL shared by register + upstream clearance */
  flaresolverr_url?: string;
  upstream_clearance_enabled?: boolean;
  upstream_clearance_mode?: "none" | "flaresolverr" | "manual" | string;
  upstream_clearance_timeout_sec?: number | string;
  upstream_clearance_refresh_interval?: number | string;
  /** When true, saving settings that enable clearance triggers a background warm-up. */
  upstream_clearance_warm_up_on_start?: boolean;
  image_challenge_cooldown_seconds?: number | string;
};

export type EmailEncryption = "tls" | "starttls" | "none";

export type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: EmailEncryption;
  from_email: string;
  from_name: string;
  has_password: boolean;
  updated_at?: string;
};

export type RegistrationRiskSettings = {
  enabled: boolean;
  device_success_limit: number;
  device_window_days: number;
  device_block_hours: number;
  ip_success_limit: number;
  ip_distinct_device_limit: number;
  ip_window_hours: number;
  ip_block_hours: number;
  pair_attempt_limit: number;
  pair_attempt_window_minutes: number;
  pair_cooldown_hours: number;
  subnet_success_limit: number;
  subnet_window_hours: number;
  disposable_domains: string[];
  proxy_cidrs: string[];
};

export type RegistrationRiskBlock = {
  id: string;
  kind: "device" | "ip" | "ip_device" | string;
  key: string;
  code: string;
  reason: string;
  created_at: string;
  expires_at: string;
};

export type ManagedImage = {
  name: string;
  path: string;
  owner_id?: string;
  owner_name?: string;
  visibility: ImageVisibility;
  date: string;
  size: number;
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  resolution_preset?: string;
  requested_size?: string;
  aspect_ratio?: string;
  orientation?: string;
  megapixels?: number;
  created_at: string;
  published_at?: string;
};

