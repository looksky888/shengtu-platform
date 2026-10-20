import type { SettingsConfig } from "@/lib/api";

import {
  normalizeImageAccountSchedule,
  normalizeImageFallbackModelSlugs,
  normalizeImageInternalModelSlug,
  normalizeImageProxyMaxRetries,
} from "./settings-normalizers";

export function buildSettingsPayload(config: SettingsConfig): SettingsConfig {
  const payload: SettingsConfig = {
    ...config,
    refresh_account_interval_minute: Math.max(1, Number(config.refresh_account_interval_minute) || 1),
    image_concurrent_limit: Math.max(1, Number(config.image_concurrent_limit) || 4),
    image_worker_count: Math.min(100, Math.max(1, Number(config.image_worker_count) || 8)),
    image_queue_capacity: Math.min(2000, Math.max(1, Number(config.image_queue_capacity) || 256)),
    video_worker_count: Math.min(32, Math.max(1, Number(config.video_worker_count) || 2)),
    video_queue_capacity: Math.min(1000, Math.max(1, Number(config.video_queue_capacity) || 64)),
    image_account_concurrency: Math.min(10, Math.max(1, Number(config.image_account_concurrency) || 1)),
    image_account_schedule: normalizeImageAccountSchedule(config.image_account_schedule),
    image_task_timeout_seconds: Math.min(3600, Math.max(30, Number(config.image_task_timeout_seconds) || 300)),
    image_internal_model_slug: normalizeImageInternalModelSlug(config.image_internal_model_slug),
    image_fallback_model_enabled: config.image_fallback_model_enabled !== false,
    image_fallback_model_slugs: normalizeImageFallbackModelSlugs(config.image_fallback_model_slugs),
    image_provider: config.image_provider === "proxy_api" ? "proxy_api" : "account_pool",
    image_proxy_base_url: String(config.image_proxy_base_url || "").trim(),
    image_proxy_api_key: String(config.image_proxy_api_key || "").trim(),
    image_proxy_model: String(config.image_proxy_model || "").trim(),
    image_proxy_models: Array.isArray(config.image_proxy_models)
      ? config.image_proxy_models.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
    image_proxy_timeout_seconds: Math.min(3600, Math.max(30, Number(config.image_proxy_timeout_seconds) || 300)),
    image_proxy_max_retries: normalizeImageProxyMaxRetries(config.image_proxy_max_retries),
    image_proxy_download_urls: config.image_proxy_download_urls !== false,
    image_credit_cost_4k: Math.max(1, Number(config.image_credit_cost_4k) || 3),
    image_credit_cost_2k: Math.max(1, Number(config.image_credit_cost_2k) || 2),
    image_credit_cost_1080p: Math.max(1, Number(config.image_credit_cost_1080p) || 1),
    gpt_image_2_credit_cost: Math.max(1, Number(config.gpt_image_2_credit_cost) || Number(config.image_credit_cost_1080p) || 1),
    gpt_image_2_5_credit_cost: Math.max(1, Number(config.gpt_image_2_5_credit_cost) || Number(config.image_credit_cost_2k) || 2),
    gpt_image_2_5_flare_credit_cost: Math.max(1, Number(config.gpt_image_2_5_flare_credit_cost) || Number(config.image_credit_cost_4k) || 3),
    gpt_image_2_5_sunburst_credit_cost: Math.max(1, Number(config.gpt_image_2_5_sunburst_credit_cost) || Number(config.image_credit_cost_4k) || 3),
    grok_image_credit_cost_1k: Math.max(1, Number(config.grok_image_credit_cost_1k) || 1),
    grok_image_credit_cost_2k: Math.max(1, Number(config.grok_image_credit_cost_2k) || 2),
    video_credit_cost_per_second: Math.max(1, Number(config.video_credit_cost_per_second) || 1),
    user_default_concurrent_limit: Math.max(0, Number(config.user_default_concurrent_limit) || 0),
    user_default_rpm_limit: Math.max(0, Number(config.user_default_rpm_limit) || 0),
    api_key_default_rpm_limit: Math.min(100000, Math.max(0, Number(config.api_key_default_rpm_limit) || 0)),
    api_key_default_concurrent_limit: Math.min(10000, Math.max(0, Number(config.api_key_default_concurrent_limit) || 0)),
    api_key_daily_request_limit: Math.min(10000000, Math.max(0, Number(config.api_key_daily_request_limit) || 0)),
    image_retention_days: Math.max(1, Number(config.image_retention_days) || 30),
    media_storage_provider: config.media_storage_provider === "r2" ? "r2" : "local",
    media_auto_cleanup_enabled: Boolean(config.media_auto_cleanup_enabled),
    media_r2_account_id: String(config.media_r2_account_id || "").trim(),
    media_r2_access_key_id: String(config.media_r2_access_key_id || "").trim(),
    media_r2_secret_access_key: String(config.media_r2_secret_access_key || "").trim(),
    media_r2_bucket: String(config.media_r2_bucket || "").trim(),
    media_r2_prefix: String(config.media_r2_prefix || "shengtu-media").trim(),
    media_r2_presign_ttl_seconds: Math.min(3600, Math.max(60, Number(config.media_r2_presign_ttl_seconds) || 300)),
    video_retention_days: Math.max(1, Number(config.video_retention_days) || 30),
    log_retention_days: Math.min(3650, Math.max(1, Number(config.log_retention_days) || 7)),
    auto_remove_invalid_accounts: Boolean(config.auto_remove_invalid_accounts),
    auto_remove_rate_limited_accounts: Boolean(config.auto_remove_rate_limited_accounts),
    proxy: config.proxy.trim(),
    flaresolverr_url: String(config.flaresolverr_url || "").trim(),
    upstream_clearance_enabled: Boolean(config.upstream_clearance_enabled),
    upstream_clearance_mode:
      config.upstream_clearance_mode === "flaresolverr" || config.upstream_clearance_mode === "manual"
        ? config.upstream_clearance_mode
        : "none",
    upstream_clearance_timeout_sec: Math.min(300, Math.max(10, Number(config.upstream_clearance_timeout_sec) || 60)),
    upstream_clearance_refresh_interval: Math.min(
      86400,
      Math.max(60, Number(config.upstream_clearance_refresh_interval) || 3600),
    ),
    upstream_clearance_warm_up_on_start: Boolean(config.upstream_clearance_warm_up_on_start),
    image_challenge_cooldown_seconds: Math.min(
      7200,
      Math.max(60, Number(config.image_challenge_cooldown_seconds) || 900),
    ),
    canvas_url: String(config.canvas_url || "").trim(),
    base_url: String(config.base_url || "").trim(),
    registration_enabled: Boolean(config.registration_enabled),
  };

  if (!payload.image_proxy_api_key) delete payload.image_proxy_api_key;
  if (!payload.media_r2_secret_access_key) delete payload.media_r2_secret_access_key;
  delete payload.image_proxy_api_key_configured;
  delete payload.image_proxy_api_key_masked;
  delete payload.media_r2_secret_access_key_configured;
  return payload;
}
