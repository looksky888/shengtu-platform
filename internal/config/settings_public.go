package config

import "chatgpt2api/internal/util"

// SettingsConfigPublic is the API-facing settings payload (secrets never included as plaintext).
// Convert from Store.Get() / Update() maps after runtime status fields are applied.
type SettingsConfigPublic struct {
	CanvasURL                     string   `json:"canvas_url"`
	Proxy                         string   `json:"proxy"`
	BaseURL                       string   `json:"base_url,omitempty"`
	RegistrationEnabled           bool     `json:"registration_enabled"`
	RefreshAccountIntervalMinute  any      `json:"refresh_account_interval_minute,omitempty"`
	ImageConcurrentLimit          any      `json:"image_concurrent_limit,omitempty"`
	ImageWorkerCount              any      `json:"image_worker_count,omitempty"`
	ImageQueueCapacity            any      `json:"image_queue_capacity,omitempty"`
	VideoWorkerCount              any      `json:"video_worker_count,omitempty"`
	VideoQueueCapacity            any      `json:"video_queue_capacity,omitempty"`
	ImageAccountConcurrency       any      `json:"image_account_concurrency,omitempty"`
	ImageAccountSchedule          string   `json:"image_account_schedule,omitempty"`
	ImageParallelGeneration       any      `json:"image_parallel_generation,omitempty"`
	ImageTaskTimeoutSeconds       any      `json:"image_task_timeout_seconds,omitempty"`
	ImageDefaultModel             string   `json:"image_default_model,omitempty"`
	ImageInternalModelSlug        string   `json:"image_internal_model_slug,omitempty"`
	ImageFallbackModelEnabled     bool     `json:"image_fallback_model_enabled"`
	ImageFallbackModelSlugs       []string `json:"image_fallback_model_slugs,omitempty"`
	ImageProvider                 string   `json:"image_provider,omitempty"`
	ImageProxyBaseURL             string   `json:"image_proxy_base_url,omitempty"`
	ImageProxyAPIKeyConfigured    bool     `json:"image_proxy_api_key_configured"`
	ImageProxyAPIKeyMasked        string   `json:"image_proxy_api_key_masked,omitempty"`
	ImageProxyModel               string   `json:"image_proxy_model,omitempty"`
	ImageProxyModels              []string `json:"image_proxy_models,omitempty"`
	ImageProxyTimeoutSeconds      any      `json:"image_proxy_timeout_seconds,omitempty"`
	ImageProxyMaxRetries          any      `json:"image_proxy_max_retries,omitempty"`
	ImageProxyDownloadURLs        bool     `json:"image_proxy_download_urls"`
	ImageCreditCost4K             any      `json:"image_credit_cost_4k,omitempty"`
	ImageCreditCost2K             any      `json:"image_credit_cost_2k,omitempty"`
	ImageCreditCost1080P          any      `json:"image_credit_cost_1080p,omitempty"`
	GPTImage2CreditCost           any      `json:"gpt_image_2_credit_cost,omitempty"`
	GPTImage25CreditCost          any      `json:"gpt_image_2_5_credit_cost,omitempty"`
	GPTImage25FlareCreditCost     any      `json:"gpt_image_2_5_flare_credit_cost,omitempty"`
	GPTImage25SunburstCreditCost  any      `json:"gpt_image_2_5_sunburst_credit_cost,omitempty"`
	GrokImageCreditCost1K         any      `json:"grok_image_credit_cost_1k,omitempty"`
	GrokImageCreditCost2K         any      `json:"grok_image_credit_cost_2k,omitempty"`
	VideoCreditCostPerSecond      any      `json:"video_credit_cost_per_second,omitempty"`
	UserDefaultConcurrentLimit    any      `json:"user_default_concurrent_limit,omitempty"`
	UserDefaultRPMLimit           any      `json:"user_default_rpm_limit,omitempty"`
	APIKeyDefaultRPMLimit         any      `json:"api_key_default_rpm_limit,omitempty"`
	APIKeyDefaultConcurrentLimit  any      `json:"api_key_default_concurrent_limit,omitempty"`
	APIKeyDailyRequestLimit       any      `json:"api_key_daily_request_limit,omitempty"`
	ImageRetentionDays            any      `json:"image_retention_days,omitempty"`
	MediaStorageProvider          string   `json:"media_storage_provider,omitempty"`
	MediaAutoCleanupEnabled       bool     `json:"media_auto_cleanup_enabled"`
	MediaR2AccountID              string   `json:"media_r2_account_id,omitempty"`
	MediaR2AccessKeyID            string   `json:"media_r2_access_key_id,omitempty"`
	MediaR2SecretConfigured       bool     `json:"media_r2_secret_access_key_configured"`
	MediaR2Bucket                 string   `json:"media_r2_bucket,omitempty"`
	MediaR2Prefix                 string   `json:"media_r2_prefix,omitempty"`
	MediaR2PresignTTLSeconds      any      `json:"media_r2_presign_ttl_seconds,omitempty"`
	VideoRetentionDays            any      `json:"video_retention_days,omitempty"`
	LogRetentionDays              any      `json:"log_retention_days,omitempty"`
	AutoRemoveInvalidAccounts     bool     `json:"auto_remove_invalid_accounts"`
	AutoRemoveRateLimitedAccounts bool     `json:"auto_remove_rate_limited_accounts"`
	LogLevels                     []string `json:"log_levels,omitempty"`
	UpdateRepo                    string   `json:"update_repo,omitempty"`
	UpdateGitHubTokenConfigured   bool     `json:"update_github_token_configured"`
	LoginPageImageURL             string   `json:"login_page_image_url,omitempty"`
	LoginPageImageMode            string   `json:"login_page_image_mode,omitempty"`
	LoginPageImageZoom            any      `json:"login_page_image_zoom,omitempty"`
	LoginPageImagePositionX       any      `json:"login_page_image_position_x,omitempty"`
	LoginPageImagePositionY       any      `json:"login_page_image_position_y,omitempty"`
	// WARP / FlareSolverr upstream clearance (image bootstrap path).
	FlareSolverrURL                  string `json:"flaresolverr_url,omitempty"`
	UpstreamClearanceEnabled         bool   `json:"upstream_clearance_enabled"`
	UpstreamClearanceMode            string `json:"upstream_clearance_mode,omitempty"`
	UpstreamClearanceTimeoutSec      any    `json:"upstream_clearance_timeout_sec,omitempty"`
	UpstreamClearanceRefreshInterval any    `json:"upstream_clearance_refresh_interval,omitempty"`
	UpstreamClearanceWarmUpOnStart   bool   `json:"upstream_clearance_warm_up_on_start"`
	ImageChallengeCooldownSeconds    any    `json:"image_challenge_cooldown_seconds,omitempty"`
}

// SettingsConfigPublicFromMap converts a public Get()/Update() map into a typed settings payload.
// Plaintext secrets (image_proxy_api_key, update_github_token) are never copied.
func SettingsConfigPublicFromMap(data map[string]any) SettingsConfigPublic {
	if data == nil {
		return SettingsConfigPublic{}
	}
	return SettingsConfigPublic{
		Proxy:                            util.Clean(data["proxy"]),
		BaseURL:                          util.Clean(data["base_url"]),
		RegistrationEnabled:              util.ToBool(data["registration_enabled"]),
		RefreshAccountIntervalMinute:     data["refresh_account_interval_minute"],
		ImageConcurrentLimit:             data["image_concurrent_limit"],
		ImageWorkerCount:                 data["image_worker_count"],
		ImageQueueCapacity:               data["image_queue_capacity"],
		VideoWorkerCount:                 data["video_worker_count"],
		VideoQueueCapacity:               data["video_queue_capacity"],
		ImageAccountConcurrency:          data["image_account_concurrency"],
		ImageAccountSchedule:             util.Clean(data["image_account_schedule"]),
		ImageParallelGeneration:          data["image_parallel_generation"],
		ImageTaskTimeoutSeconds:          data["image_task_timeout_seconds"],
		ImageDefaultModel:                util.Clean(data["image_default_model"]),
		ImageInternalModelSlug:           util.Clean(data["image_internal_model_slug"]),
		ImageFallbackModelEnabled:        util.ToBool(util.ValueOr(data["image_fallback_model_enabled"], true)),
		ImageFallbackModelSlugs:          util.AsStringSlice(data["image_fallback_model_slugs"]),
		ImageProvider:                    util.Clean(data["image_provider"]),
		ImageProxyBaseURL:                util.Clean(data["image_proxy_base_url"]),
		ImageProxyAPIKeyConfigured:       util.ToBool(data["image_proxy_api_key_configured"]),
		ImageProxyAPIKeyMasked:           util.Clean(data["image_proxy_api_key_masked"]),
		ImageProxyModel:                  util.Clean(data["image_proxy_model"]),
		ImageProxyModels:                 util.AsStringSlice(data["image_proxy_models"]),
		ImageProxyTimeoutSeconds:         data["image_proxy_timeout_seconds"],
		ImageProxyMaxRetries:             data["image_proxy_max_retries"],
		ImageProxyDownloadURLs:           util.ToBool(util.ValueOr(data["image_proxy_download_urls"], true)),
		ImageCreditCost4K:                data["image_credit_cost_4k"],
		ImageCreditCost2K:                data["image_credit_cost_2k"],
		ImageCreditCost1080P:             data["image_credit_cost_1080p"],
		GPTImage2CreditCost:              data["gpt_image_2_credit_cost"],
		GPTImage25CreditCost:             data["gpt_image_2_5_credit_cost"],
		GPTImage25FlareCreditCost:        data["gpt_image_2_5_flare_credit_cost"],
		GPTImage25SunburstCreditCost:     data["gpt_image_2_5_sunburst_credit_cost"],
		GrokImageCreditCost1K:            data["grok_image_credit_cost_1k"],
		GrokImageCreditCost2K:            data["grok_image_credit_cost_2k"],
		VideoCreditCostPerSecond:         data["video_credit_cost_per_second"],
		UserDefaultConcurrentLimit:       data["user_default_concurrent_limit"],
		UserDefaultRPMLimit:              data["user_default_rpm_limit"],
		APIKeyDefaultRPMLimit:            data["api_key_default_rpm_limit"],
		APIKeyDefaultConcurrentLimit:     data["api_key_default_concurrent_limit"],
		APIKeyDailyRequestLimit:          data["api_key_daily_request_limit"],
		ImageRetentionDays:               data["image_retention_days"],
		MediaStorageProvider:             util.Clean(data["media_storage_provider"]),
		MediaAutoCleanupEnabled:          util.ToBool(data["media_auto_cleanup_enabled"]),
		MediaR2AccountID:                 util.Clean(data["media_r2_account_id"]),
		MediaR2AccessKeyID:               util.Clean(data["media_r2_access_key_id"]),
		MediaR2SecretConfigured:          util.ToBool(data["media_r2_secret_access_key_configured"]),
		MediaR2Bucket:                    util.Clean(data["media_r2_bucket"]),
		MediaR2Prefix:                    util.Clean(data["media_r2_prefix"]),
		MediaR2PresignTTLSeconds:         data["media_r2_presign_ttl_seconds"],
		VideoRetentionDays:               data["video_retention_days"],
		LogRetentionDays:                 data["log_retention_days"],
		AutoRemoveInvalidAccounts:        util.ToBool(data["auto_remove_invalid_accounts"]),
		AutoRemoveRateLimitedAccounts:    util.ToBool(data["auto_remove_rate_limited_accounts"]),
		LogLevels:                        util.AsStringSlice(data["log_levels"]),
		UpdateRepo:                       util.Clean(data["update_repo"]),
		UpdateGitHubTokenConfigured:      util.ToBool(data["update_github_token_configured"]),
		CanvasURL:                        util.Clean(data["canvas_url"]),
		LoginPageImageURL:                util.Clean(data["login_page_image_url"]),
		LoginPageImageMode:               util.Clean(data["login_page_image_mode"]),
		LoginPageImageZoom:               data["login_page_image_zoom"],
		LoginPageImagePositionX:          data["login_page_image_position_x"],
		LoginPageImagePositionY:          data["login_page_image_position_y"],
		FlareSolverrURL:                  util.Clean(data["flaresolverr_url"]),
		UpstreamClearanceEnabled:         util.ToBool(data["upstream_clearance_enabled"]),
		UpstreamClearanceMode:            util.Clean(data["upstream_clearance_mode"]),
		UpstreamClearanceTimeoutSec:      data["upstream_clearance_timeout_sec"],
		UpstreamClearanceRefreshInterval: data["upstream_clearance_refresh_interval"],
		UpstreamClearanceWarmUpOnStart:   util.ToBool(data["upstream_clearance_warm_up_on_start"]),
		ImageChallengeCooldownSeconds:    data["image_challenge_cooldown_seconds"],
	}
}

// AppMetaPublic is the unauthenticated app-meta payload for login/landing branding.
type AppMetaPublic struct {
	CanvasURL               string  `json:"canvas_url"`
	AppTitle                string  `json:"app_title"`
	ProjectName             string  `json:"project_name"`
	LoginPageImageURL       string  `json:"login_page_image_url"`
	LoginPageImageMode      string  `json:"login_page_image_mode"`
	LoginPageImageZoom      float64 `json:"login_page_image_zoom"`
	LoginPageImagePositionX float64 `json:"login_page_image_position_x"`
	LoginPageImagePositionY float64 `json:"login_page_image_position_y"`
}
