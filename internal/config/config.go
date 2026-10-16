package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	defaultImageTaskTimeoutSeconds = 600
	minImageTaskTimeoutSeconds     = 30
	maxImageTaskTimeoutSeconds     = 3600
)

type Store struct {
	mu              sync.RWMutex
	RootDir         string
	DataDir         string
	EnvFile         string
	data            map[string]any
	externalEnvKeys map[string]struct{}
	storageBackend  storage.Backend
}

func NewStore() (*Store, error) {
	root, err := resolveRootDir()
	if err != nil {
		return nil, err
	}

	envFile, dedicatedEnvFile, err := resolveSettingsEnvFile(root)
	if err != nil {
		return nil, err
	}
	envFileValues := readEnvObject(envFile)
	s := &Store{
		RootDir:         root,
		DataDir:         filepath.Join(root, "data"),
		EnvFile:         envFile,
		data:            map[string]any{},
		externalEnvKeys: map[string]struct{}{},
	}
	for _, item := range os.Environ() {
		key, value, _ := strings.Cut(item, "=")
		if dedicatedEnvFile && isManagedSettingEnvKey(key) {
			continue
		}
		if _, ok := envFileValues[key]; ok && isManagedSettingEnvKey(key) {
			continue
		}
		if fileValue, ok := envFileValues[key]; ok && value == fileValue {
			continue
		}
		s.externalEnvKeys[key] = struct{}{}
	}
	if err := os.MkdirAll(s.DataDir, 0o755); err != nil {
		return nil, err
	}
	s.loadEnvFile()
	s.data = settingsFromEnvValues(envFileValues)
	return s, nil
}

func resolveRootDir() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if configured := strings.TrimSpace(os.Getenv("CHATGPT2API_ROOT")); configured != "" {
		return filepath.Abs(configured)
	}
	if root := findAncestorWithFile(cwd, ".env"); root != "" {
		return root, nil
	}
	if root := findAncestorWithProjectGoMod(cwd); root != "" {
		return root, nil
	}
	return filepath.Abs(cwd)
}

func findAncestorWithFile(start, name string) string {
	dir, err := filepath.Abs(start)
	if err != nil {
		return ""
	}
	for {
		info, statErr := os.Stat(filepath.Join(dir, name))
		if statErr == nil && !info.IsDir() {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func findAncestorWithProjectGoMod(start string) string {
	dir, err := filepath.Abs(start)
	if err != nil {
		return ""
	}
	for {
		data, readErr := os.ReadFile(filepath.Join(dir, "go.mod"))
		if readErr == nil && strings.Contains(string(data), "module chatgpt2api") {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func (s *Store) Get() map[string]any {
	s.mu.RLock()
	data := util.CopyMap(s.data)
	s.mu.RUnlock()
	data["refresh_account_interval_minute"] = s.RefreshAccountIntervalMinute()
	data["image_concurrent_limit"] = s.ImageConcurrentLimit()
	data["image_worker_count"] = s.ImageWorkerCount()
	data["image_queue_capacity"] = s.ImageQueueCapacity()
	data["video_worker_count"] = s.VideoWorkerCount()
	data["video_queue_capacity"] = s.VideoQueueCapacity()
	data["image_account_concurrency"] = s.ImageAccountConcurrency()
	data["image_account_schedule"] = s.ImageAccountSchedule()
	data["image_parallel_generation"] = s.ImageParallelGeneration()
	data["image_task_timeout_seconds"] = s.ImageTaskTimeoutSeconds()
	data["image_default_model"] = s.ImageDefaultModel()
	data["image_internal_model_slug"] = s.ImageInternalModelSlug()
	data["image_fallback_model_enabled"] = s.ImageFallbackModelEnabled()
	data["image_fallback_model_slugs"] = s.ImageFallbackModelSlugs()
	data["image_provider"] = s.ImageProvider()
	data["image_proxy_base_url"] = s.ImageProxyBaseURL()
	data["image_proxy_api_key_configured"] = s.ImageProxyAPIKey() != ""
	data["image_proxy_api_key_masked"] = maskSecret(s.ImageProxyAPIKey())
	data["image_proxy_model"] = s.ImageProxyModel()
	data["image_proxy_models"] = s.ImageProxyModels()
	data["image_proxy_timeout_seconds"] = s.ImageProxyTimeoutSeconds()
	data["image_proxy_max_retries"] = s.ImageProxyMaxRetries()
	data["image_proxy_download_urls"] = s.ImageProxyDownloadURLs()
	data["image_credit_cost_1080p"] = s.ImageCreditCost1080P()
	data["image_credit_cost_2k"] = s.ImageCreditCost2K()
	data["image_credit_cost_4k"] = s.ImageCreditCost4K()
	data["gpt_image_2_credit_cost"] = s.GPTImage2CreditCost()
	data["gpt_image_2_5_credit_cost"] = s.GPTImage25CreditCost()
	data["gpt_image_2_5_flare_credit_cost"] = s.GPTImage25FlareCreditCost()
	data["gpt_image_2_5_sunburst_credit_cost"] = s.GPTImage25SunburstCreditCost()
	data["grok_image_credit_cost_1k"] = s.GrokImageCreditCost1K()
	data["grok_image_credit_cost_2k"] = s.GrokImageCreditCost2K()
	data["video_credit_cost_per_second"] = s.VideoCreditCostPerSecond()
	data["user_default_concurrent_limit"] = s.UserDefaultConcurrentLimit()
	data["user_default_rpm_limit"] = s.UserDefaultRPMLimit()
	data["api_key_default_rpm_limit"] = s.APIKeyDefaultRPMLimit()
	data["api_key_default_concurrent_limit"] = s.APIKeyDefaultConcurrentLimit()
	data["api_key_daily_request_limit"] = s.APIKeyDailyRequestLimit()
	data["image_retention_days"] = s.ImageRetentionDays()
	s.populateMediaStorageSettings(data)
	data["video_retention_days"] = s.VideoRetentionDays()
	data["log_retention_days"] = s.LogRetentionDays()
	data["auto_remove_invalid_accounts"] = s.AutoRemoveInvalidAccounts()
	data["auto_remove_rate_limited_accounts"] = s.AutoRemoveRateLimitedAccounts()
	data["log_levels"] = s.LogLevels()
	data["proxy"] = s.Proxy()
	data["base_url"] = s.BaseURL()
	data["registration_enabled"] = s.RegistrationEnabled()
	data["update_repo"] = s.UpdateRepo()
	data["update_github_token_configured"] = s.UpdateGitHubToken() != ""
	data["canvas_url"] = s.CanvasURL()
	data["login_page_image_url"] = s.LoginPageImageURL()
	data["login_page_image_mode"] = s.LoginPageImageMode()
	data["login_page_image_zoom"] = s.LoginPageImageZoom()
	data["login_page_image_position_x"] = s.LoginPageImagePositionX()
	data["login_page_image_position_y"] = s.LoginPageImagePositionY()
	data["flaresolverr_url"] = s.FlareSolverrURL()
	data["upstream_clearance_enabled"] = s.UpstreamClearanceEnabled()
	data["upstream_clearance_mode"] = s.UpstreamClearanceMode()
	data["upstream_clearance_timeout_sec"] = s.UpstreamClearanceTimeoutSec()
	data["upstream_clearance_refresh_interval"] = s.UpstreamClearanceRefreshInterval()
	data["upstream_clearance_warm_up_on_start"] = s.UpstreamClearanceWarmUpOnStart()
	data["image_challenge_cooldown_seconds"] = s.ImageChallengeCooldownSeconds()
	delete(data, "update_github_token")
	delete(data, "image_proxy_api_key")
	delete(data, "media_r2_secret_access_key")
	return data
}

func (s *Store) Update(data map[string]any) (map[string]any, error) {
	if err := normalizeCanvasUpdate(data); err != nil {
		return nil, err
	}
	if err := validateMediaStorageUpdate(data); err != nil {
		return nil, err
	}
	s.mu.Lock()
	next := util.CopyMap(s.data)
	for key, value := range data {
		if strings.HasPrefix(key, "video_webhook_") {
			continue
		}
		if key == "update_github_token_configured" {
			continue
		}
		if key == "image_proxy_api_key_configured" || key == "image_proxy_api_key_masked" {
			continue
		}
		if skipMediaStorageSetting(key, value) {
			continue
		}
		// Ignore legacy Grok 中转 settings (removed in 3.5; Grok uses 号池 only).
		if strings.HasPrefix(key, "grok_proxy_") {
			continue
		}
		if key == "update_github_token" && strings.TrimSpace(fmt.Sprint(value)) == "" {
			continue
		}
		if key == "image_proxy_api_key" && strings.TrimSpace(fmt.Sprint(value)) == "" {
			continue
		}
		next[key] = value
	}
	if value, ok := next["login_page_image_mode"]; ok {
		next["login_page_image_mode"] = normalizeLoginPageImageMode(value)
	}
	if value, ok := next["image_task_timeout_seconds"]; ok {
		next["image_task_timeout_seconds"] = normalizeImageTaskTimeoutSeconds(value)
	}
	next["image_concurrent_limit"] = clampInt(intSetting(next["image_concurrent_limit"], 3), 1, 100)
	next["image_worker_count"] = clampInt(intSetting(util.ValueOr(next["image_worker_count"], 8), 8), 1, 100)
	next["image_queue_capacity"] = clampInt(intSetting(util.ValueOr(next["image_queue_capacity"], 256), 256), 1, 2000)
	next["video_worker_count"] = clampInt(intSetting(util.ValueOr(next["video_worker_count"], 2), 2), 1, 32)
	next["video_queue_capacity"] = clampInt(intSetting(util.ValueOr(next["video_queue_capacity"], 64), 64), 1, 1000)
	next["image_account_concurrency"] = clampInt(intSetting(next["image_account_concurrency"], 1), 1, 10)
	next["api_key_default_rpm_limit"] = clampInt(intSetting(util.ValueOr(next["api_key_default_rpm_limit"], 0), 0), 0, 100000)
	next["api_key_default_concurrent_limit"] = clampInt(intSetting(util.ValueOr(next["api_key_default_concurrent_limit"], 0), 0), 0, 10000)
	next["api_key_daily_request_limit"] = clampInt(intSetting(util.ValueOr(next["api_key_daily_request_limit"], 0), 0), 0, 10000000)
	next["image_account_schedule"] = normalizeImageAccountSchedule(next["image_account_schedule"])
	next["image_parallel_generation"] = util.ToBool(next["image_parallel_generation"])
	next["image_default_model"] = normalizeImageDefaultModel(util.ValueOr(next["image_default_model"], util.ImageModelGPT25Flare))
	next["image_internal_model_slug"] = normalizeImageInternalModelSlug(util.ValueOr(next["image_internal_model_slug"], util.ImageModelGPT53))
	next["image_fallback_model_enabled"] = util.ToBool(util.ValueOr(next["image_fallback_model_enabled"], true))
	next["image_fallback_model_slugs"] = normalizeImageFallbackModelSlugs(util.ValueOr(next["image_fallback_model_slugs"], []string{util.ImageModelGPT55, util.ImageModelAuto}))
	next["image_provider"] = normalizeImageProvider(next["image_provider"])
	// Never fmt.Sprint missing keys (that yields the literal "<nil>").
	next["image_proxy_base_url"] = util.Clean(util.ValueOr(next["image_proxy_base_url"], ""))
	next["image_proxy_model"] = util.Clean(util.ValueOr(next["image_proxy_model"], ""))
	next["image_proxy_models"] = cleanCSVSetting(util.ValueOr(next["image_proxy_models"], ""))
	next["image_proxy_timeout_seconds"] = clampInt(intSetting(util.ValueOr(next["image_proxy_timeout_seconds"], defaultImageTaskTimeoutSeconds), defaultImageTaskTimeoutSeconds), 30, 3600)
	next["image_proxy_max_retries"] = clampInt(intSetting(util.ValueOr(next["image_proxy_max_retries"], 1), 1), 0, 5)
	next["image_proxy_download_urls"] = util.ToBool(util.ValueOr(next["image_proxy_download_urls"], true))
	// Strip legacy Grok 中转 keys from persisted settings.
	for _, key := range []string{
		"grok_proxy_base_url", "grok_proxy_api_key", "grok_proxy_model", "grok_proxy_models",
		"grok_proxy_timeout_seconds", "grok_proxy_max_retries", "grok_proxy_download_urls",
		"feature_grok_native",
	} {
		delete(next, key)
	}
	next["flaresolverr_url"] = util.Clean(util.ValueOr(next["flaresolverr_url"], ""))
	next["upstream_clearance_enabled"] = util.ToBool(util.ValueOr(next["upstream_clearance_enabled"], false))
	next["upstream_clearance_mode"] = normalizeUpstreamClearanceMode(util.ValueOr(next["upstream_clearance_mode"], "none"))
	next["upstream_clearance_timeout_sec"] = clampInt(intSetting(util.ValueOr(next["upstream_clearance_timeout_sec"], 60), 60), 10, 300)
	next["upstream_clearance_refresh_interval"] = clampInt(intSetting(util.ValueOr(next["upstream_clearance_refresh_interval"], 3600), 3600), 60, 86400)
	next["upstream_clearance_warm_up_on_start"] = util.ToBool(util.ValueOr(next["upstream_clearance_warm_up_on_start"], false))
	next["image_challenge_cooldown_seconds"] = clampInt(intSetting(util.ValueOr(next["image_challenge_cooldown_seconds"], 900), 900), 60, 7200)
	next["image_credit_cost_1080p"] = normalizeImageCreditCost(next["image_credit_cost_1080p"], 1)
	next["image_credit_cost_2k"] = normalizeImageCreditCost(next["image_credit_cost_2k"], 2)
	next["image_credit_cost_4k"] = normalizeImageCreditCost(next["image_credit_cost_4k"], 3)
	next["gpt_image_2_credit_cost"] = normalizeImageCreditCost(util.ValueOr(next["gpt_image_2_credit_cost"], next["image_credit_cost_1080p"]), util.ToInt(next["image_credit_cost_1080p"], 1))
	next["gpt_image_2_5_credit_cost"] = normalizeImageCreditCost(util.ValueOr(next["gpt_image_2_5_credit_cost"], next["image_credit_cost_2k"]), util.ToInt(next["image_credit_cost_2k"], 2))
	next["gpt_image_2_5_flare_credit_cost"] = normalizeImageCreditCost(util.ValueOr(next["gpt_image_2_5_flare_credit_cost"], next["image_credit_cost_4k"]), util.ToInt(next["image_credit_cost_4k"], 3))
	next["gpt_image_2_5_sunburst_credit_cost"] = normalizeImageCreditCost(util.ValueOr(next["gpt_image_2_5_sunburst_credit_cost"], next["image_credit_cost_4k"]), util.ToInt(next["image_credit_cost_4k"], 3))
	next["grok_image_credit_cost_1k"] = normalizeImageCreditCost(next["grok_image_credit_cost_1k"], 1)
	next["grok_image_credit_cost_2k"] = normalizeImageCreditCost(next["grok_image_credit_cost_2k"], 2)
	next["video_credit_cost_per_second"] = normalizeImageCreditCost(next["video_credit_cost_per_second"], 1)
	next["image_retention_days"] = clampInt(intSetting(util.ValueOr(next["image_retention_days"], 30), 30), 1, 3650)
	normalizeMediaStorageSettings(next)
	next["video_retention_days"] = clampInt(intSetting(util.ValueOr(next["video_retention_days"], 30), 30), 1, 3650)
	for _, removedKey := range []string{"model_channel", "model_channel_status", "model_channels", "prompt_remote_sources", "prompt_remote_sync_enabled", "prompt_remote_sync_interval_minute"} {
		delete(next, removedKey)
	}
	next["update_repo"] = normalizeUpdateRepo(util.ValueOr(next["update_repo"], "looksky888/shengtu-platform"))
	if err := s.validateSettingsUpdateLocked(next); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.data = next
	err := s.saveLocked()
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return s.Get(), nil
}

func (s *Store) StorageBackend() (storage.Backend, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.storageBackend != nil {
		return s.storageBackend, nil
	}
	backend, err := storage.NewBackendFromEnv(s.DataDir)
	if err != nil {
		return nil, err
	}
	s.storageBackend = backend
	return backend, nil
}

func (s *Store) settingValue(key string, fallback any) any {
	s.mu.RLock()
	data := util.CopyMap(s.data)
	s.mu.RUnlock()
	return s.settingValueFromData(data, key, fallback)
}

func (s *Store) settingValueFromData(data map[string]any, key string, fallback any) any {
	envKey := settingEnvKeys[key]
	if envKey != "" {
		if value, ok := os.LookupEnv(envKey); ok {
			// Empty env (common in docker-compose `${VAR:-}`) must not shadow saved settings
			// or force "not configured" when the admin already stored a key/URL in data.
			if strings.TrimSpace(value) != "" {
				if _, external := s.externalEnvKeys[envKey]; external {
					return value
				}
			}
		}
	}
	if data != nil {
		if value, ok := data[key]; ok {
			// Treat empty string as missing so a non-empty env can still fill defaults,
			// except we already skip empty env above.
			if !(isEmptySettingValue(value)) {
				return value
			}
		}
	}
	if envKey != "" {
		if value, ok := os.LookupEnv(envKey); ok {
			if strings.TrimSpace(value) != "" {
				return value
			}
		}
	}
	return fallback
}

func isEmptySettingValue(value any) bool {
	if value == nil {
		return true
	}
	if s, ok := value.(string); ok {
		return strings.TrimSpace(s) == ""
	}
	return false
}

func (s *Store) validateSettingsUpdateLocked(data map[string]any) error {
	if err := validateUpdateRepo(util.Clean(util.ValueOr(data["update_repo"], "looksky888/shengtu-platform"))); err != nil {
		return err
	}
	if normalizeImageProvider(data["image_provider"]) == "proxy_api" {
		baseURL := strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "image_proxy_base_url", "")))
		apiKey := strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "image_proxy_api_key", "")))
		model := strings.TrimSpace(fmt.Sprint(s.settingValueFromData(data, "image_proxy_model", "")))
		if baseURL == "" {
			return errors.New("启用中转 API 模式时需填写中转站 URL")
		}
		if apiKey == "" {
			return errors.New("启用中转 API 模式时需填写 API Key")
		}
		if model == "" {
			return errors.New("启用中转 API 模式时需填写模型名称")
		}
		if err := validateAbsoluteHTTPURL(baseURL); err != nil {
			return errors.New("中转站 URL 须为绝对 http(s) 地址")
		}
	}
	if err := s.validateMediaStorageSettings(data); err != nil {
		return err
	}
	return nil
}
