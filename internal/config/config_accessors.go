package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"chatgpt2api/internal/util"
)

func (s *Store) AdminUsername() string {
	value := strings.TrimSpace(os.Getenv("CHATGPT2API_ADMIN_USERNAME"))
	if value == "" {
		return "admin"
	}
	return value
}

func (s *Store) AdminPassword() string {
	return strings.TrimSpace(os.Getenv("CHATGPT2API_ADMIN_PASSWORD"))
}

func (s *Store) RegistrationEnabled() bool {
	return util.ToBool(s.settingValue("registration_enabled", false))
}

func (s *Store) RefreshAccountIntervalMinute() int {
	return intSetting(s.settingValue("refresh_account_interval_minute", 5), 5)
}

func (s *Store) ImageRetentionDays() int {
	value := intSetting(s.settingValue("image_retention_days", 30), 30)
	if value < 1 {
		return 1
	}
	return value
}

func (s *Store) VideoRetentionDays() int {
	value := intSetting(s.settingValue("video_retention_days", 30), 30)
	if value < 1 {
		return 1
	}
	return value
}

func (s *Store) LogRetentionDays() int {
	value := intSetting(s.settingValue("log_retention_days", 7), 7)
	if value < 1 {
		return 1
	}
	if value > 3650 {
		return 3650
	}
	return value
}

func (s *Store) ImageConcurrentLimit() int {
	value := intSetting(s.settingValue("image_concurrent_limit", 3), 3)
	if value < 1 {
		return 1
	}
	return value
}

func (s *Store) ImageWorkerCount() int {
	return clampInt(intSetting(s.settingValue("image_worker_count", 8), 8), 1, 100)
}

func (s *Store) ImageQueueCapacity() int {
	return clampInt(intSetting(s.settingValue("image_queue_capacity", 256), 256), 1, 2000)
}

func (s *Store) VideoWorkerCount() int {
	return clampInt(intSetting(s.settingValue("video_worker_count", 2), 2), 1, 32)
}

func (s *Store) VideoQueueCapacity() int {
	return clampInt(intSetting(s.settingValue("video_queue_capacity", 64), 64), 1, 1000)
}

func (s *Store) ImageAccountConcurrency() int {
	value := intSetting(s.settingValue("image_account_concurrency", 1), 1)
	if value < 1 {
		return 1
	}
	if value > 10 {
		return 10
	}
	return value
}

// ImageAccountSchedule returns account selection strategy under concurrency:
// least_loaded | least_fail | quota_aware
func (s *Store) ImageAccountSchedule() string {
	return normalizeImageAccountSchedule(s.settingValue("image_account_schedule", "least_loaded"))
}

func (s *Store) ImageParallelGeneration() bool {
	return util.ToBool(s.settingValue("image_parallel_generation", false))
}

func (s *Store) ImageTaskTimeoutSeconds() int {
	return normalizeImageTaskTimeoutSeconds(s.settingValue("image_task_timeout_seconds", defaultImageTaskTimeoutSeconds))
}

func (s *Store) ImageDefaultModel() string {
	return normalizeImageDefaultModel(s.settingValue("image_default_model", util.ImageModelGPT25Flare))
}

func (s *Store) ImageInternalModelSlug() string {
	return normalizeImageInternalModelSlug(s.settingValue("image_internal_model_slug", util.ImageModelGPT53))
}

func (s *Store) ImageFallbackModelEnabled() bool {
	return util.ToBool(s.settingValue("image_fallback_model_enabled", true))
}

func (s *Store) ImageFallbackModelSlugs() []string {
	return normalizeImageFallbackModelSlugs(s.settingValue("image_fallback_model_slugs", []string{util.ImageModelGPT55, util.ImageModelAuto}))
}

func (s *Store) ImageProvider() string {
	return normalizeImageProvider(s.settingValue("image_provider", "account_pool"))
}

// ImageProviderSource reports where the active GPT image provider was read
// from. It is diagnostic metadata only; it never changes routing precedence.
func (s *Store) ImageProviderSource() string {
	if s == nil {
		return "default"
	}
	const envKey = "CHATGPT2API_IMAGE_PROVIDER"
	s.mu.RLock()
	_, external := s.externalEnvKeys[envKey]
	value, configured := s.data["image_provider"]
	s.mu.RUnlock()
	if external && strings.TrimSpace(os.Getenv(envKey)) != "" {
		return "environment"
	}
	if configured && strings.TrimSpace(fmt.Sprint(value)) != "" {
		return "env_file"
	}
	if strings.TrimSpace(os.Getenv(envKey)) != "" {
		return "runtime_environment"
	}
	return "default"
}

func (s *Store) ImageProxyBaseURL() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("image_proxy_base_url", "")))
}

func (s *Store) ImageProxyAPIKey() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("image_proxy_api_key", "")))
}

func (s *Store) ImageProxyModel() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("image_proxy_model", "gpt-image-2")))
}

func (s *Store) ImageProxyModels() []string {
	return cleanCSVSetting(s.settingValue("image_proxy_models", ""))
}

func (s *Store) ImageProxyTimeoutSeconds() int {
	return clampInt(intSetting(s.settingValue("image_proxy_timeout_seconds", s.ImageTaskTimeoutSeconds()), s.ImageTaskTimeoutSeconds()), 30, 3600)
}

func (s *Store) ImageProxyMaxRetries() int {
	return clampInt(intSetting(s.settingValue("image_proxy_max_retries", 1), 1), 0, 5)
}

func (s *Store) ImageProxyDownloadURLs() bool {
	return util.ToBool(s.settingValue("image_proxy_download_urls", true))
}

func (s *Store) ImageCreditCost1080P() int {
	return normalizeImageCreditCost(s.settingValue("image_credit_cost_1080p", 1), 1)
}

func (s *Store) GPTImage2CreditCost() int {
	return normalizeImageCreditCost(s.settingValue("gpt_image_2_credit_cost", s.ImageCreditCost1080P()), s.ImageCreditCost1080P())
}

func (s *Store) GPTImage25CreditCost() int {
	return normalizeImageCreditCost(s.settingValue("gpt_image_2_5_credit_cost", s.ImageCreditCost2K()), s.ImageCreditCost2K())
}

func (s *Store) GPTImage25FlareCreditCost() int {
	return normalizeImageCreditCost(s.settingValue("gpt_image_2_5_flare_credit_cost", s.ImageCreditCost4K()), s.ImageCreditCost4K())
}

func (s *Store) GPTImage25SunburstCreditCost() int {
	return normalizeImageCreditCost(s.settingValue("gpt_image_2_5_sunburst_credit_cost", s.ImageCreditCost4K()), s.ImageCreditCost4K())
}

func (s *Store) ImageCreditCost2K() int {
	return normalizeImageCreditCost(s.settingValue("image_credit_cost_2k", 2), 2)
}

func (s *Store) ImageCreditCost4K() int {
	return normalizeImageCreditCost(s.settingValue("image_credit_cost_4k", 3), 3)
}

func (s *Store) GrokImageCreditCost1K() int {
	return normalizeImageCreditCost(s.settingValue("grok_image_credit_cost_1k", 1), 1)
}

func (s *Store) GrokImageCreditCost2K() int {
	return normalizeImageCreditCost(s.settingValue("grok_image_credit_cost_2k", 2), 2)
}

func (s *Store) VideoCreditCostPerSecond() int {
	return normalizeImageCreditCost(s.settingValue("video_credit_cost_per_second", 1), 1)
}

func (s *Store) UserDefaultConcurrentLimit() int {
	value := intSetting(s.settingValue("user_default_concurrent_limit", 0), 0)
	if value < 0 {
		return 0
	}
	return value
}

func (s *Store) UserDefaultRPMLimit() int {
	value := intSetting(s.settingValue("user_default_rpm_limit", 0), 0)
	if value < 0 {
		return 0
	}
	return value
}

func (s *Store) APIKeyDefaultRPMLimit() int {
	value := intSetting(s.settingValue("api_key_default_rpm_limit", 0), 0)
	if value < 0 {
		return 0
	}
	return value
}

func (s *Store) APIKeyDefaultConcurrentLimit() int {
	value := intSetting(s.settingValue("api_key_default_concurrent_limit", 0), 0)
	if value < 0 {
		return 0
	}
	return value
}

func (s *Store) APIKeyDailyRequestLimit() int {
	value := intSetting(s.settingValue("api_key_daily_request_limit", 0), 0)
	if value < 0 {
		return 0
	}
	return value
}

func (s *Store) AutoRemoveInvalidAccounts() bool {
	return util.ToBool(s.settingValue("auto_remove_invalid_accounts", false))
}

func (s *Store) AutoRemoveRateLimitedAccounts() bool {
	return util.ToBool(s.settingValue("auto_remove_rate_limited_accounts", false))
}

func (s *Store) BaseURL() string {
	return strings.TrimRight(strings.TrimSpace(fmt.Sprint(s.settingValue("base_url", ""))), "/")
}

func (s *Store) Proxy() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("proxy", "")))
}

func (s *Store) FlareSolverrURL() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("flaresolverr_url", "")))
}

func (s *Store) UpstreamClearanceEnabled() bool {
	return util.ToBool(s.settingValue("upstream_clearance_enabled", false))
}

func (s *Store) UpstreamClearanceMode() string {
	return normalizeUpstreamClearanceMode(s.settingValue("upstream_clearance_mode", "none"))
}

func (s *Store) UpstreamClearanceTimeoutSec() int {
	return clampInt(intSetting(s.settingValue("upstream_clearance_timeout_sec", 60), 60), 10, 300)
}

func (s *Store) UpstreamClearanceRefreshInterval() int {
	return clampInt(intSetting(s.settingValue("upstream_clearance_refresh_interval", 3600), 3600), 60, 86400)
}

func (s *Store) UpstreamClearanceWarmUpOnStart() bool {
	return util.ToBool(s.settingValue("upstream_clearance_warm_up_on_start", false))
}

func (s *Store) ImageChallengeCooldownSeconds() int {
	return clampInt(intSetting(s.settingValue("image_challenge_cooldown_seconds", 900), 900), 60, 7200)
}

// --- 3.5 feature flags / sidecars ---

func (s *Store) FeatureICloud() bool {
	return util.ToBool(s.settingValue("feature_icloud", false))
}

func (s *Store) FeatureGrokRegister() bool {
	return util.ToBool(s.settingValue("feature_grok_register", false))
}

// FeatureRegisterBackend returns go | python (default go during migration).
func (s *Store) FeatureRegisterBackend() string {
	v := strings.ToLower(strings.TrimSpace(fmt.Sprint(s.settingValue("feature_register_backend", "go"))))
	switch v {
	case "python", "py":
		return "python"
	default:
		return "go"
	}
}

func (s *Store) ICloudPrivacyMailBaseURL() string {
	v := strings.TrimSpace(fmt.Sprint(s.settingValue("icloud_privacy_mail_base_url", "")))
	if v == "" {
		return "http://icloud-privacy-mail:8787"
	}
	return strings.TrimRight(v, "/")
}

func (s *Store) GrokRuntimeBaseURL() string {
	v := strings.TrimSpace(fmt.Sprint(s.settingValue("grok_runtime_base_url", "")))
	if v == "" {
		return "http://grok-runtime:8091"
	}
	return strings.TrimRight(v, "/")
}

func (s *Store) InternalServiceToken() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("internal_service_token", "")))
}

func (s *Store) UpdateProxyURL() string {
	if value := strings.TrimSpace(os.Getenv("CHATGPT2API_UPDATE_PROXY_URL")); value != "" {
		return value
	}
	return s.Proxy()
}

func (s *Store) UpdateRepo() string {
	return normalizeUpdateRepo(s.settingValue("update_repo", "ZyphrZero/chatgpt2api"))
}

func (s *Store) UpdateGitHubToken() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("update_github_token", "")))
}

func (s *Store) LogLevels() []string {
	raw := s.settingValue("log_levels", "")
	var parts []string
	switch v := raw.(type) {
	case []string:
		parts = v
	case []any:
		for _, item := range v {
			parts = append(parts, fmt.Sprint(item))
		}
	default:
		parts = strings.Split(fmt.Sprint(raw), ",")
	}
	allowed := map[string]struct{}{"debug": {}, "info": {}, "warning": {}, "error": {}}
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		level := strings.ToLower(strings.TrimSpace(part))
		if _, ok := allowed[level]; ok {
			out = append(out, level)
		}
	}
	return out
}

func (s *Store) ImagesDir() string {
	path := filepath.Join(s.DataDir, "images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (s *Store) ImageThumbnailsDir() string {
	path := filepath.Join(s.DataDir, "image_thumbnails")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (s *Store) ImageMetadataDir() string {
	path := filepath.Join(s.DataDir, "image_metadata")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (s *Store) LoginPageImagesDir() string {
	path := filepath.Join(s.DataDir, "login_page_images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (s *Store) AnnouncementImagesDir() string {
	path := filepath.Join(s.DataDir, "announcement_images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (s *Store) LoginPageImageURL() string {
	return strings.TrimSpace(fmt.Sprint(s.settingValue("login_page_image_url", "")))
}

func (s *Store) LoginPageImageMode() string {
	return normalizeLoginPageImageMode(s.settingValue("login_page_image_mode", "contain"))
}

func (s *Store) LoginPageImageZoom() float64 {
	return clampFloat(floatSetting(s.settingValue("login_page_image_zoom", 1), 1), 1, 3)
}

func (s *Store) LoginPageImagePositionX() float64 {
	return clampFloat(floatSetting(s.settingValue("login_page_image_position_x", 50), 50), 0, 100)
}

func (s *Store) LoginPageImagePositionY() float64 {
	return clampFloat(floatSetting(s.settingValue("login_page_image_position_y", 50), 50), 0, 100)
}
