package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/config"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) settingsConfigWithRuntimeStatus(cfg map[string]any) map[string]any {
	out := util.CopyMap(cfg)
	for _, removedKey := range []string{"model_channel", "model_channel_status", "model_channels", "prompt_remote_sources", "prompt_remote_sync_enabled", "prompt_remote_sync_interval_minute"} {
		delete(out, removedKey)
	}
	// Defense in depth: never expose plaintext secrets on settings responses.
	delete(out, "update_github_token")
	delete(out, "image_proxy_api_key")
	delete(out, "media_r2_secret_access_key")
	// Drop legacy Grok 中转 keys if still present in stored settings.
	for _, key := range []string{
		"grok_proxy_base_url", "grok_proxy_api_key", "grok_proxy_api_key_configured", "grok_proxy_api_key_masked",
		"grok_proxy_model", "grok_proxy_models", "grok_proxy_timeout_seconds", "grok_proxy_max_retries", "grok_proxy_download_urls",
	} {
		delete(out, key)
	}
	return out
}

func (a *App) settingsConfigPublic(cfg map[string]any) config.SettingsConfigPublic {
	return config.SettingsConfigPublicFromMap(a.settingsConfigWithRuntimeStatus(cfg))
}

func (a *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		// Typed settings pilot: SettingsConfigPublic (no plaintext secrets).
		util.WriteJSON(w, http.StatusOK, configResponse[config.SettingsConfigPublic]{Config: a.settingsConfigPublic(a.config.Get())})
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
			return
		}
		if raw, hasCanvas := body["canvas_url"]; hasCanvas && identity.Role != service.AuthRoleAdmin {
			value, valid := raw.(string)
			if !valid || strings.TrimSpace(value) != a.config.CanvasURL() {
				util.WriteError(w, http.StatusForbidden, "只有管理员可以修改无限画布入口")
				return
			}
			delete(body, "canvas_url")
		}
		updated, err := a.config.Update(body)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		a.setUpdateService(newUpdateService(a.config))
		// Hot-apply account schedule strategy used by concurrent image locks.
		if a.accounts != nil {
			a.accounts.SetScheduleStrategy(service.AccountScheduleStrategy(a.config.ImageAccountSchedule()))
		}
		a.syncImageChannelsFromSettingsUpdate(body)
		// Hot-apply upstream clearance settings in-memory without mutating os.Environ().
		hotApplyUpstreamClearanceEnv(a.config)
		// Optional warm-up after save when enabled (best-effort, non-blocking for response).
		if a.config.UpstreamClearanceWarmUpOnStart() && a.config.UpstreamClearanceEnabled() {
			warmCtx := a.rootCtx
			if warmCtx == nil {
				warmCtx = context.Background()
			}
			a.cleanupWG.Add(1)
			go func() {
				defer a.cleanupWG.Done()
				_, _ = service.WarmUpUpstreamClearance(warmCtx)
			}()
		}
		util.WriteJSON(w, http.StatusOK, configResponse[config.SettingsConfigPublic]{Config: a.settingsConfigPublic(updated)})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

var (
	upstreamClearanceEnvMu        sync.Mutex
	upstreamClearanceSeeded       bool
	lastUpstreamClearanceCfg      service.UpstreamClearanceRuntimeConfig
	lastImageChallengeCooldownSec int
)

// hotApplyUpstreamClearanceEnv pushes saved settings into the synchronized
// in-memory runtime config used by clearance & cooldown helpers without racing os.Setenv.
func hotApplyUpstreamClearanceEnv(cfg *config.Store) {
	if cfg == nil {
		return
	}
	upstreamClearanceEnvMu.Lock()
	defer upstreamClearanceEnvMu.Unlock()

	desired := service.UpstreamClearanceRuntimeConfig{
		Enabled:            cfg.UpstreamClearanceEnabled(),
		Mode:               strings.TrimSpace(strings.ToLower(cfg.UpstreamClearanceMode())),
		FlareSolverrURL:    strings.TrimRight(strings.TrimSpace(cfg.FlareSolverrURL()), "/"),
		TimeoutSec:         cfg.UpstreamClearanceTimeoutSec(),
		RefreshIntervalSec: cfg.UpstreamClearanceRefreshInterval(),
		ProxyURL:           strings.TrimSpace(cfg.Proxy()),
	}
	cooldownSec := cfg.ImageChallengeCooldownSeconds()

	clearanceChanged := !upstreamClearanceSeeded || desired != lastUpstreamClearanceCfg
	service.ConfigureUpstreamClearance(desired)
	service.SetImageChallengeCooldownSeconds(cooldownSec)
	lastUpstreamClearanceCfg = desired
	lastImageChallengeCooldownSec = cooldownSec
	upstreamClearanceSeeded = true

	if clearanceChanged {
		service.InvalidateUpstreamClearance()
	}
}

func (a *App) syncImageChannelsFromSettingsUpdate(body map[string]any) {
	if a == nil || a.config == nil || a.imageChannels == nil || len(body) == 0 {
		return
	}
	hasKey := func(keys ...string) bool {
		for _, k := range keys {
			if _, ok := body[k]; ok {
				return true
			}
		}
		return false
	}

	var syncCfg service.ImageChannelSettingsSync
	shouldSync := false

	if hasKey("image_concurrent_limit") {
		limit := a.config.ImageConcurrentLimit()
		syncCfg.MaxConcurrency = &limit
		shouldSync = true
	}

	gptCosts := map[string]int{}
	if hasKey("gpt_image_2_credit_cost", "image_credit_cost_1080p") {
		gptCosts[util.ImageModelGPT] = a.config.GPTImage2CreditCost()
	}
	if hasKey("gpt_image_2_5_credit_cost", "image_credit_cost_2k") {
		gptCosts[util.ImageModelGPT25] = a.config.GPTImage25CreditCost()
	}
	if hasKey("gpt_image_2_5_flare_credit_cost", "image_credit_cost_4k") {
		gptCosts[util.ImageModelGPT25Flare] = a.config.GPTImage25FlareCreditCost()
	}
	if hasKey("gpt_image_2_5_sunburst_credit_cost", "image_credit_cost_4k") {
		gptCosts[util.ImageModelGPT25Sunburst] = a.config.GPTImage25SunburstCreditCost()
	}
	if hasKey("gpt_image_2_6_credit_cost", "image_credit_cost_2k") {
		gptCosts[util.ImageModelGPT26] = a.config.GPTImage26CreditCost()
	}
	if hasKey("gpt_image_2_6_flare_credit_cost", "image_credit_cost_4k") {
		gptCosts[util.ImageModelGPT26Flare] = a.config.GPTImage26FlareCreditCost()
	}
	if hasKey("gpt_image_2_6_sunburst_credit_cost", "image_credit_cost_4k") {
		gptCosts[util.ImageModelGPT26Sunburst] = a.config.GPTImage26SunburstCreditCost()
	}
	if len(gptCosts) > 0 {
		syncCfg.GPTModelCosts = gptCosts
		shouldSync = true
	}

	if hasKey("grok_image_credit_cost_1k") {
		c1 := a.config.GrokImageCreditCost1K()
		syncCfg.GrokImageCost1K = &c1
		shouldSync = true
	}
	if hasKey("grok_image_credit_cost_2k") {
		c2 := a.config.GrokImageCreditCost2K()
		syncCfg.GrokImageCost2K = &c2
		shouldSync = true
	}

	if hasKey(
		"image_provider",
		"image_proxy_base_url",
		"image_proxy_api_key",
		"image_proxy_model",
		"image_proxy_models",
		"image_proxy_timeout_seconds",
		"image_proxy_max_retries",
		"image_proxy_download_urls",
	) {
		syncCfg.UpdateProxy = true
		syncCfg.LegacyProxy = service.ImageChannelLegacyConfig{
			ProxyEnabled:   a.config.ImageProvider() == imageProviderProxyAPI,
			ProxyBaseURL:   a.config.ImageProxyBaseURL(),
			ProxyAPIKey:    a.config.ImageProxyAPIKey(),
			ProxyModel:     a.config.ImageProxyModel(),
			ProxyModels:    a.config.ImageProxyModels(),
			TimeoutSeconds: a.config.ImageProxyTimeoutSeconds(),
			MaxRetries:     a.config.ImageProxyMaxRetries(),
			DownloadURLs:   a.config.ImageProxyDownloadURLs(),
			MaxConcurrency: a.config.ImageConcurrentLimit(),
			GPTModelCosts: map[string]int{
				util.ImageModelGPT:           a.config.GPTImage2CreditCost(),
				util.ImageModelGPT25:         a.config.GPTImage25CreditCost(),
				util.ImageModelGPT25Flare:    a.config.GPTImage25FlareCreditCost(),
				util.ImageModelGPT25Sunburst: a.config.GPTImage25SunburstCreditCost(),
				util.ImageModelGPT26:         a.config.GPTImage26CreditCost(),
				util.ImageModelGPT26Flare:    a.config.GPTImage26FlareCreditCost(),
				util.ImageModelGPT26Sunburst: a.config.GPTImage26SunburstCreditCost(),
			},
			GrokImageCost1K: a.config.GrokImageCreditCost1K(),
			GrokImageCost2K: a.config.GrokImageCreditCost2K(),
		}
		shouldSync = true
	}

	if !shouldSync {
		return
	}
	if err := a.imageChannels.SyncSettings(syncCfg); err != nil && a.logger != nil {
		a.logger.Warning("sync settings to image channels failed", "error", err.Error())
	}
}

func (a *App) handleProxyClearanceTest(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	// Ensure env matches latest saved config before testing.
	hotApplyUpstreamClearanceEnv(a.config)
	body, ok := readJSONMapOr400(w, r)
	if !ok {
		return
	}
	target := strings.TrimSpace(util.Clean(body["target_url"]))
	if target == "" {
		target = "https://chatgpt.com"
	}
	start := time.Now()
	// Force refresh for an explicit test.
	bundle, err := service.GetUpstreamClearance(r.Context(), true)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		util.WriteJSON(w, http.StatusOK, resultResponse[upstreamClearanceTestResult]{Result: upstreamClearanceTestResult{
			OK: false, Status: "error", LatencyMS: latency, Error: err.Error(), TargetURL: target,
		}})
		return
	}
	if bundle == nil {
		util.WriteJSON(w, http.StatusOK, resultResponse[upstreamClearanceTestResult]{Result: upstreamClearanceTestResult{
			OK: false, Status: "disabled", LatencyMS: latency,
			Error: "upstream clearance is disabled; enable it in settings first", TargetURL: target,
		}})
		return
	}
	cookieCount := len(bundle.Cookies)
	hasUserAgent := strings.TrimSpace(bundle.UserAgent) != ""
	util.WriteJSON(w, http.StatusOK, resultResponse[upstreamClearanceTestResult]{Result: upstreamClearanceTestResult{
		OK: true, Status: "ok", LatencyMS: latency, TargetURL: target,
		CookieCount: &cookieCount, HasUserAgent: &hasUserAgent, ProxyURL: &bundle.ProxyURL,
		// Never return cookie values.
		Message: fmt.Sprintf("clearance ok: %d cookies", len(bundle.Cookies)),
	}})
}

func (a *App) handleAppMeta(w http.ResponseWriter, r *http.Request) {
	util.WriteJSON(w, http.StatusOK, config.AppMetaPublic{
		CanvasURL:               a.config.CanvasURL(),
		AppTitle:                "chatgpt2api",
		ProjectName:             "chatgpt2api",
		LoginPageImageURL:       a.config.LoginPageImageURL(),
		LoginPageImageMode:      a.config.LoginPageImageMode(),
		LoginPageImageZoom:      a.config.LoginPageImageZoom(),
		LoginPageImagePositionX: a.config.LoginPageImagePositionX(),
		LoginPageImagePositionY: a.config.LoginPageImagePositionY(),
	})
}

func (a *App) handlePermissionCatalog(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	util.WriteJSON(w, http.StatusOK, a.auth.PermissionCatalog())
}

func (a *App) handleLogs(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	query, err := parseLogQuery(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Typed list pilot: LogEntryPublic (time/summary/detail wire shape).
	items := a.logs.SearchTyped(query)
	util.WriteJSON(w, http.StatusOK, service.LogListResponse{
		Items:    items,
		Total:    len(items),
		PageSize: normalizedHTTPLogPageSize(query.Limit),
	})
}

func (a *App) handleLogGovernance(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, governanceResponse[service.LogGovernanceSummary]{Governance: a.logs.GovernanceSummary()})
	case http.MethodPost:
		var body service.LogCleanupInput
		if !readJSONOr400(w, r, &body) {
			return
		}
		retentionDays := body.RetentionDays
		if retentionDays <= 0 {
			retentionDays = a.config.LogRetentionDays()
		}
		result, err := a.logs.CleanupOlderThan(retentionDays)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		a.runIncrementalVacuum(r.Context(), 2000)
		util.WriteJSON(w, http.StatusOK, logCleanupResponse{Cleanup: result, Governance: a.logs.GovernanceSummary()})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleStorageInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	backend, err := a.config.StorageBackend()
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, storageInfoResponse{Backend: backend.Info(), Health: backend.HealthCheck()})
}

func (a *App) handleProxy(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.URL.Path == "/api/proxy/test" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		candidate := strings.TrimSpace(util.Clean(body["url"]))
		if candidate == "" {
			candidate = a.config.Proxy()
		}
		if candidate == "" {
			util.WriteError(w, http.StatusBadRequest, "请提供代理 URL")
			return
		}
		util.WriteJSON(w, http.StatusOK, resultResponse[service.ProxyTestResultPublic]{Result: a.proxy.TestTyped(candidate, 15*time.Second)})
		return
	}
	if r.URL.Path == "/api/proxy/clearance/test" {
		a.handleProxyClearanceTest(w, r)
		return
	}
	if r.URL.Path == "/api/proxy/runtime" {
		// Read-only runtime status: never mutate os.Environ() or invalidate cached clearance on GET.
		hasProxy := strings.TrimSpace(a.config.Proxy()) != ""
		enabled := a.config.UpstreamClearanceEnabled()
		mode := strings.TrimSpace(strings.ToLower(a.config.UpstreamClearanceMode()))
		if mode == "" {
			if enabled {
				mode = "flaresolverr"
			} else {
				mode = "none"
			}
		}
		status := service.UpstreamClearanceStatus()
		status.Enabled = enabled
		status.EgressMode = map[bool]string{true: "single_proxy", false: "direct"}[hasProxy]
		status.HasProxy = hasProxy
		status.ProxySource = map[bool]string{true: "config", false: "none"}[hasProxy]
		status.ClearanceEnabled = enabled && mode != "none"
		status.ClearanceMode = mode
		status.FlareSolverrURL = strings.TrimRight(strings.TrimSpace(a.config.FlareSolverrURL()), "/")
		status.RefreshIntervalSec = a.config.UpstreamClearanceRefreshInterval()

		util.WriteJSON(w, http.StatusOK, proxyRuntimeResponse{
			Runtime: proxyRuntimeSettings{
				Enabled:    hasProxy || enabled,
				EgressMode: map[bool]string{true: "single_proxy", false: "direct"}[hasProxy],
				ProxyURL:   a.config.Proxy(),
				Clearance: proxyClearanceSettings{
					Enabled: enabled, Mode: a.config.UpstreamClearanceMode(),
					FlareSolverrURL: a.config.FlareSolverrURL(), TimeoutSec: a.config.UpstreamClearanceTimeoutSec(),
					RefreshInterval: a.config.UpstreamClearanceRefreshInterval(), WarmUpOnStart: a.config.UpstreamClearanceWarmUpOnStart(),
				},
			},
			Status: status,
		})
		return
	}
	if r.URL.Path == "/api/proxy/clearance/warmup" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		hotApplyUpstreamClearanceEnv(a.config)
		result, err := service.WarmUpUpstreamClearance(r.Context())
		if err != nil && result.Error == "" {
			result.Error = err.Error()
		}
		response := clearanceWarmUpResponse{Result: result, Status: service.UpstreamClearanceStatus()}
		util.WriteJSON(w, http.StatusOK, response)
		return
	}
	switch r.Method {
	case http.MethodGet:
		util.WriteJSON(w, http.StatusOK, proxyResponse[service.ProxySettingsPublic]{Proxy: service.ProxySettingsPublic{URL: a.config.Proxy()}})
	case http.MethodPost:
		body, ok := readJSONMapOr400(w, r)
		if !ok {
			return
		}
		url := util.Clean(body["url"])
		updated, err := a.config.Update(map[string]any{"proxy": url})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		hotApplyUpstreamClearanceEnv(a.config)
		util.WriteJSON(w, http.StatusOK, proxyResponse[service.ProxySettingsPublic]{Proxy: service.ProxySettingsPublic{URL: util.Clean(updated["proxy"])}})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
