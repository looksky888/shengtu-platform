import type { CPARemoteFile, RegisterConfig, SettingsConfig } from "@/lib/api";
import { isGPTImageModel } from "@/lib/api-models";
import {
  normalizeLoginPageImageMode,
  normalizeLoginPageImageTransform,
} from "@/lib/login-page-image-layout";

export function normalizeImageAccountSchedule(value: unknown): "least_loaded" | "least_fail" | "quota_aware" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "least_fail" || raw === "least-fail" || raw === "fail") return "least_fail";
  if (raw === "quota_aware" || raw === "quota-aware" || raw === "quota") return "quota_aware";
  return "least_loaded";
}

export function normalizeRegisterClearanceConfig(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: Boolean(raw.enabled),
    mode: String(raw.mode || "flaresolverr"),
    flaresolverr_url: String(raw.flaresolverr_url || ""),
    timeout_seconds: Math.max(1, Number(raw.timeout_seconds) || 60),
    refresh_interval_seconds: Math.max(0, Number(raw.refresh_interval_seconds) || 3600),
    proxy: String(raw.proxy || ""),
    user_agent: String(raw.user_agent || ""),
    cf_clearance: String(raw.cf_clearance || ""),
    cf_cookies: String(raw.cf_cookies || ""),
  };
}

export function normalizeRegisterConfig(config: RegisterConfig): RegisterConfig {
  const source = config;
  const rawTarget = String(source?.target || "openai").trim().toLowerCase();
  const target = rawTarget === "grok" ? "grok" : "openai";
  const grok =
    source?.grok && typeof source.grok === "object" && !Array.isArray(source.grok)
      ? { ...(source.grok as Record<string, unknown>) }
      : {};
  return {
    ...source,
    target,
    backend: typeof source.backend === "string" ? source.backend : source.backend,
    proxy: typeof source.proxy === "string" ? source.proxy : "",
    total: Number(source.total || 1),
    threads: Number(source.threads || 1),
    mode: source.mode || "total",
    target_quota: Number(source.target_quota || 1),
    target_available: Number(source.target_available || 1),
    check_interval: Number(source.check_interval || 5),
    mail: {
      request_timeout: Number(source.mail?.request_timeout || 15),
      wait_timeout: Number(source.mail?.wait_timeout || 30),
      wait_interval: Number(source.mail?.wait_interval || 3),
      providers: Array.isArray(source.mail?.providers) ? source.mail.providers : [],
    },
    clearance: normalizeRegisterClearanceConfig(source.clearance) as RegisterConfig["clearance"],
    grok,
  };
}
export function normalizeConfig(config: SettingsConfig): SettingsConfig {
  const loginImageTransform = normalizeLoginPageImageTransform({
    zoom: Number(config.login_page_image_zoom),
    positionX: Number(config.login_page_image_position_x),
    positionY: Number(config.login_page_image_position_y),
  });
  return {
    ...config,
    refresh_account_interval_minute: Number(config.refresh_account_interval_minute || 5),
    image_concurrent_limit: Number(config.image_concurrent_limit || 4),
    image_worker_count: Math.min(100, Math.max(1, Number(config.image_worker_count) || 8)),
    image_queue_capacity: Math.min(2000, Math.max(1, Number(config.image_queue_capacity) || 256)),
    video_worker_count: Math.min(32, Math.max(1, Number(config.video_worker_count) || 2)),
    video_queue_capacity: Math.min(1000, Math.max(1, Number(config.video_queue_capacity) || 64)),
    image_account_concurrency: Math.min(10, Math.max(1, Number(config.image_account_concurrency) || 1)),
    image_account_schedule: normalizeImageAccountSchedule(config.image_account_schedule),
    image_task_timeout_seconds: Number(config.image_task_timeout_seconds || 300),
    image_internal_model_slug: normalizeImageInternalModelSlug(config.image_internal_model_slug),
    image_fallback_model_enabled: config.image_fallback_model_enabled !== false,
    image_fallback_model_slugs: normalizeImageFallbackModelSlugs(config.image_fallback_model_slugs),
    image_provider: config.image_provider === "proxy_api" ? "proxy_api" : "account_pool",
    image_proxy_base_url: typeof config.image_proxy_base_url === "string" ? config.image_proxy_base_url : "",
    image_proxy_api_key: "",
    image_proxy_api_key_configured: Boolean(config.image_proxy_api_key_configured),
    image_proxy_api_key_masked: typeof config.image_proxy_api_key_masked === "string" ? config.image_proxy_api_key_masked : "",
    image_proxy_model: typeof config.image_proxy_model === "string" ? config.image_proxy_model : "gpt-image-2.5-flare",
    image_proxy_models: Array.isArray(config.image_proxy_models) ? config.image_proxy_models.map(String).filter(Boolean) : [],
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
    user_default_concurrent_limit: Number(config.user_default_concurrent_limit || 0),
    user_default_rpm_limit: Number(config.user_default_rpm_limit || 0),
    api_key_default_rpm_limit: Number(config.api_key_default_rpm_limit || 0),
    api_key_default_concurrent_limit: Number(config.api_key_default_concurrent_limit || 0),
    api_key_daily_request_limit: Number(config.api_key_daily_request_limit || 0),
    image_retention_days: Number(config.image_retention_days || 30),
    media_storage_provider: config.media_storage_provider === "r2" ? "r2" : "local",
    media_auto_cleanup_enabled:
      typeof config.media_auto_cleanup_enabled === "boolean"
        ? config.media_auto_cleanup_enabled
        : config.media_storage_provider !== "r2",
    media_r2_account_id: String(config.media_r2_account_id || ""),
    media_r2_access_key_id: String(config.media_r2_access_key_id || ""),
    media_r2_secret_access_key: "",
    media_r2_secret_access_key_configured: Boolean(config.media_r2_secret_access_key_configured),
    media_r2_bucket: String(config.media_r2_bucket || ""),
    media_r2_prefix: String(config.media_r2_prefix || "shengtu-media"),
    media_r2_presign_ttl_seconds: Math.min(3600, Math.max(60, Number(config.media_r2_presign_ttl_seconds) || 300)),
    video_retention_days: Number(config.video_retention_days || 30),
    log_retention_days: Number(config.log_retention_days || 7),
    auto_remove_invalid_accounts: Boolean(config.auto_remove_invalid_accounts),
    auto_remove_rate_limited_accounts: Boolean(config.auto_remove_rate_limited_accounts),
    log_levels: Array.isArray(config.log_levels) ? config.log_levels : [],
    proxy: typeof config.proxy === "string" ? config.proxy : "",
    flaresolverr_url: typeof config.flaresolverr_url === "string" ? config.flaresolverr_url : "",
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
    canvas_url: typeof config.canvas_url === "string" ? config.canvas_url : "",
    base_url: typeof config.base_url === "string" ? config.base_url : "",
    registration_enabled: Boolean(config.registration_enabled),
    login_page_image_url: typeof config.login_page_image_url === "string" ? config.login_page_image_url : "",
    login_page_image_mode: normalizeLoginPageImageMode(config.login_page_image_mode),
    login_page_image_zoom: loginImageTransform.zoom,
    login_page_image_position_x: loginImageTransform.positionX,
    login_page_image_position_y: loginImageTransform.positionY,
  };
}

export function normalizeImageProxyMaxRetries(value: unknown) {
  const retries = Number(value);
  if (!Number.isFinite(retries)) {
    return 1;
  }
  return Math.min(5, Math.max(0, retries));
}

export function normalizeImageInternalModelSlug(value: unknown) {
  const model = String(value || "").trim();
  const allowed = new Set(["auto", "gpt-5-5-thinking", "gpt-5-3", "gpt-5-3-mini", "gpt-5.5", "gpt-5.4", "gpt-5", "gpt-5-1", "gpt-5-2", "gpt-5-mini"]);
  if (!model || model === "gpt-image-2" || model === "gpt-image-2.5" || model === "gpt-image-2.5-flare" || model === "gpt-image-2.5-sunburst") {
    return "gpt-5-3";
  }
  return allowed.has(model) ? model : "gpt-5-3";
}

export function normalizeImageFallbackModelSlugs(value: unknown) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of raw) {
    const rawModel = String(item || "").trim();
    if (!rawModel) continue;
    const model = isGPTImageModel(rawModel) ? "auto" : rawModel;
    if (!new Set(["auto", "gpt-5-5-thinking", "gpt-5-3", "gpt-5-3-mini", "gpt-5.5", "gpt-5.4", "gpt-5", "gpt-5-1", "gpt-5-2", "gpt-5-mini"]).has(model)) continue;
    if (!seen.has(model)) {
      seen.add(model);
      models.push(model);
    }
  }
  return models.length > 0 ? models : ["gpt-5.5", "auto"];
}

export function normalizeFiles(items: CPARemoteFile[]) {
  const seen = new Set<string>();
  const files: CPARemoteFile[] = [];
  for (const item of items) {
    const name = String(item.name || "").trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    files.push({
      name,
      email: String(item.email || "").trim(),
    });
  }
  return files;
}
