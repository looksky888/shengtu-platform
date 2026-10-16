package httpapi

import (
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
)

type upstreamClearanceTestResult struct {
	OK           bool    `json:"ok"`
	Status       string  `json:"status"`
	LatencyMS    int64   `json:"latency_ms"`
	Error        string  `json:"error,omitempty"`
	TargetURL    string  `json:"target_url"`
	CookieCount  *int    `json:"cookie_count,omitempty"`
	HasUserAgent *bool   `json:"has_user_agent,omitempty"`
	ProxyURL     *string `json:"proxy_url,omitempty"`
	Message      string  `json:"message,omitempty"`
}

type logCleanupResponse struct {
	Cleanup    service.LogCleanupResult     `json:"cleanup"`
	Governance service.LogGovernanceSummary `json:"governance"`
}

type storageInfoResponse struct {
	Backend storage.BackendInfo   `json:"backend"`
	Health  storage.BackendHealth `json:"health"`
}

type proxyClearanceSettings struct {
	Enabled         bool   `json:"enabled"`
	Mode            string `json:"mode"`
	FlareSolverrURL string `json:"flaresolverr_url"`
	TimeoutSec      int    `json:"timeout_sec"`
	RefreshInterval int    `json:"refresh_interval"`
	WarmUpOnStart   bool   `json:"warm_up_on_start"`
}

type proxyRuntimeSettings struct {
	Enabled    bool                   `json:"enabled"`
	EgressMode string                 `json:"egress_mode"`
	ProxyURL   string                 `json:"proxy_url"`
	Clearance  proxyClearanceSettings `json:"clearance"`
}

type proxyRuntimeResponse struct {
	Runtime proxyRuntimeSettings                  `json:"runtime"`
	Status  service.UpstreamClearanceStatusPublic `json:"status"`
}

type clearanceWarmUpResponse struct {
	Result service.UpstreamClearanceWarmUpPublic `json:"result"`
	Status service.UpstreamClearanceStatusPublic `json:"status"`
}
