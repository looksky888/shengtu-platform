package service

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// UpstreamClearance is a process-wide Cloudflare clearance cache for chatgpt.com
// (image generation / bootstrap). Inspired by chatgpt2api-1.7.0 proxy_runtime clearance.
//
// Env:
//
//	CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED=true|false  (default false)
//	CHATGPT2API_UPSTREAM_CLEARANCE_MODE=flaresolverr|none
//	CHATGPT2API_FLARESOLVERR_URL=http://flaresolverr:8191
//	CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC=60
//	CHATGPT2API_UPSTREAM_CLEARANCE_REFRESH_INTERVAL=3600
//	CHATGPT2API_PROXY (optional; passed to FlareSolverr so cookies match egress)
//
// UpstreamClearanceEnabled reports whether image/bootstrap should use FlareSolverr clearance.
func UpstreamClearanceEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("CHATGPT2API_UPSTREAM_CLEARANCE_ENABLED")))
	if v == "" {
		return false
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func upstreamClearanceMode() string {
	mode := strings.TrimSpace(strings.ToLower(os.Getenv("CHATGPT2API_UPSTREAM_CLEARANCE_MODE")))
	if mode == "" {
		if UpstreamClearanceEnabled() {
			return "flaresolverr"
		}
		return "none"
	}
	return mode
}

func upstreamFlareSolverrURL() string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv("CHATGPT2API_FLARESOLVERR_URL")), "/")
}

func upstreamClearanceTimeout() time.Duration {
	sec := envIntDefault("CHATGPT2API_UPSTREAM_CLEARANCE_TIMEOUT_SEC", 60)
	if sec < 10 {
		sec = 10
	}
	if sec > 300 {
		sec = 300
	}
	return time.Duration(sec) * time.Second
}

func upstreamClearanceRefreshInterval() time.Duration {
	sec := envIntDefault("CHATGPT2API_UPSTREAM_CLEARANCE_REFRESH_INTERVAL", 3600)
	if sec < 60 {
		sec = 60
	}
	return time.Duration(sec) * time.Second
}

func envIntDefault(name string, def int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

func upstreamClearanceProxyURL() string {
	// Prefer explicit runtime proxy, else global CHATGPT2API_PROXY.
	if v := strings.TrimSpace(os.Getenv("CHATGPT2API_PROXY_RUNTIME_PROXY_URL")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("CHATGPT2API_PROXY"))
}

func resolveUpstreamClearanceProxyURL(proxyURL string) string {
	if trimmed := strings.TrimSpace(proxyURL); trimmed != "" {
		return trimmed
	}
	return upstreamClearanceProxyURL()
}

func upstreamHostFromURL(target string) string {
	candidate := strings.TrimSpace(target)
	if candidate == "" {
		return ""
	}
	parsed, err := url.Parse(candidate)
	if (err != nil || parsed.Hostname() == "") && !strings.Contains(candidate, "://") {
		parsed, err = url.Parse("https://" + candidate)
	}
	if err != nil {
		return ""
	}
	return strings.Trim(strings.ToLower(strings.TrimSpace(parsed.Hostname())), ".")
}

func upstreamClearanceCacheKey(host, proxy string) string {
	return host + "|" + strings.TrimSpace(proxy)
}

func (b *UpstreamClearanceBundle) validFor(host, proxy string, now time.Time) bool {
	if b == nil {
		return false
	}
	bh := strings.Trim(strings.ToLower(b.TargetHost), ".")
	hh := strings.Trim(strings.ToLower(host), ".")
	if bh != "" && hh != "" && bh != hh {
		return false
	}
	if strings.TrimSpace(b.ProxyURL) != strings.TrimSpace(proxy) {
		return false
	}
	if !b.ExpiresAt.IsZero() && !now.Before(b.ExpiresAt) {
		return false
	}
	return b.UserAgent != "" || len(b.Cookies) > 0
}

// GetUpstreamClearance returns a cached or freshly fetched clearance bundle.
func GetUpstreamClearance(ctx context.Context, force bool) (*UpstreamClearanceBundle, error) {
	return GetUpstreamClearanceForProxy(ctx, "", force)
}

// GetUpstreamClearanceForProxy returns a cached or freshly fetched clearance bundle for a specific egress proxy.
func GetUpstreamClearanceForProxy(ctx context.Context, proxyOverride string, force bool) (*UpstreamClearanceBundle, error) {
	if !UpstreamClearanceEnabled() || upstreamClearanceMode() != "flaresolverr" {
		return nil, nil
	}
	flareURL := upstreamFlareSolverrURL()
	if flareURL == "" {
		return nil, fmt.Errorf("flaresolverr_url_empty")
	}
	target := defaultUpstreamClearanceTarget
	host := upstreamHostFromURL(target)
	proxyURL := resolveUpstreamClearanceProxyURL(proxyOverride)
	key := upstreamClearanceCacheKey(host, proxyURL)
	now := time.Now()

	upstreamClearanceMu.Lock()
	if !force {
		if b := upstreamClearanceCache[key]; b.validFor(host, proxyURL, now) {
			upstreamClearanceMu.Unlock()
			return b, nil
		}
	}
	if flight := upstreamClearanceFlight[key]; flight != nil {
		upstreamClearanceMu.Unlock()
		select {
		case <-flight.done:
			return flight.bundle, flight.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	flight := &upstreamClearanceFlightState{done: make(chan struct{}), generation: upstreamClearanceGeneration}
	upstreamClearanceFlight[key] = flight
	upstreamClearanceMu.Unlock()

	bundle, err := fetchFlareSolverrUpstreamClearance(ctx, flareURL, target, proxyURL, upstreamClearanceTimeout(), upstreamClearanceRefreshInterval())
	upstreamClearanceMu.Lock()
	flight.bundle, flight.err = bundle, err
	if err == nil && flight.generation == upstreamClearanceGeneration {
		upstreamClearanceCache[key] = bundle
	}
	delete(upstreamClearanceFlight, key)
	close(flight.done)
	upstreamClearanceMu.Unlock()
	return bundle, err
}

// CachedUpstreamClearance returns a valid cached bundle without starting a
// FlareSolverr request. Request construction must stay non-blocking; a refresh
// is only justified after the upstream actually returns a Cloudflare challenge.
func CachedUpstreamClearance() *UpstreamClearanceBundle {
	return CachedUpstreamClearanceForProxy("")
}

// CachedUpstreamClearanceForProxy returns a valid cached clearance bundle for proxyOverride without blocking.
func CachedUpstreamClearanceForProxy(proxyOverride string) *UpstreamClearanceBundle {
	if !UpstreamClearanceEnabled() || upstreamClearanceMode() != "flaresolverr" {
		return nil
	}
	host := upstreamHostFromURL(defaultUpstreamClearanceTarget)
	proxyURL := resolveUpstreamClearanceProxyURL(proxyOverride)
	key := upstreamClearanceCacheKey(host, proxyURL)
	now := time.Now()

	upstreamClearanceMu.Lock()
	defer upstreamClearanceMu.Unlock()
	bundle := upstreamClearanceCache[key]
	if !bundle.validFor(host, proxyURL, now) {
		return nil
	}
	return bundle
}

// RefreshUpstreamClearanceForChallenge refreshes clearance after a confirmed
// Cloudflare challenge. A recent failure is reused briefly so one blocked
// egress does not make every account wait for the same FlareSolverr timeout.
func RefreshUpstreamClearanceForChallenge(ctx context.Context) (*UpstreamClearanceBundle, error) {
	return RefreshUpstreamClearanceForChallengeWithProxy(ctx, "")
}

// RefreshUpstreamClearanceForChallengeWithProxy refreshes clearance for a specific egress proxy.
func RefreshUpstreamClearanceForChallengeWithProxy(ctx context.Context, proxyOverride string) (*UpstreamClearanceBundle, error) {
	if !UpstreamClearanceEnabled() || upstreamClearanceMode() != "flaresolverr" {
		return nil, nil
	}
	host := upstreamHostFromURL(defaultUpstreamClearanceTarget)
	proxyURL := resolveUpstreamClearanceProxyURL(proxyOverride)
	key := upstreamClearanceCacheKey(host, proxyURL)
	now := time.Now()

	upstreamClearanceMu.Lock()
	if failure, ok := upstreamClearanceFailures[key]; ok && now.Sub(failure.failedAt) < upstreamClearanceFailureBackoff {
		upstreamClearanceMu.Unlock()
		return nil, failure.err
	}
	upstreamClearanceMu.Unlock()

	bundle, err := GetUpstreamClearanceForProxy(ctx, proxyURL, true)
	upstreamClearanceMu.Lock()
	if err != nil {
		upstreamClearanceFailures[key] = upstreamClearanceFailureState{err: err, failedAt: time.Now()}
	} else {
		delete(upstreamClearanceFailures, key)
	}
	upstreamClearanceMu.Unlock()
	return bundle, err
}

// InvalidateUpstreamClearance drops cache so next call re-fetches.
func InvalidateUpstreamClearance() {
	upstreamClearanceMu.Lock()
	defer upstreamClearanceMu.Unlock()
	upstreamClearanceGeneration++
	for key := range upstreamClearanceCache {
		delete(upstreamClearanceCache, key)
	}
	for key := range upstreamClearanceFailures {
		delete(upstreamClearanceFailures, key)
	}
}

// ApplyUpstreamClearanceToHeaders merges Cookie / optional User-Agent from clearance.
func ApplyUpstreamClearanceToHeaders(headers map[string]string, bundle *UpstreamClearanceBundle) map[string]string {
	if headers == nil {
		headers = map[string]string{}
	}
	if bundle == nil {
		return headers
	}
	// Clearance cookies are bound to the browser fingerprint that obtained them.
	// Keep the account's existing User-Agent when present; replacing it with
	// FlareSolverr's UA while retaining the account Sec-CH headers invalidates
	// the clearance on ChatGPT's edge. This matches the reference proxy runtime:
	// inject a UA only when the request has none.
	if ua := strings.TrimSpace(bundle.UserAgent); ua != "" && strings.TrimSpace(headers["User-Agent"]) == "" {
		headers["User-Agent"] = ua
	}
	parts := make([]string, 0, len(bundle.Cookies))
	for _, c := range bundle.Cookies {
		name := strings.TrimSpace(c.Name)
		value := strings.TrimSpace(c.Value)
		if name == "" || value == "" {
			continue
		}
		parts = append(parts, name+"="+value)
	}
	if len(parts) == 0 {
		return headers
	}
	cookieVal := strings.Join(parts, "; ")
	if existing := strings.TrimSpace(headers["Cookie"]); existing != "" {
		// A forced refresh must replace stale clearance cookies while retaining
		// unrelated account/session cookies.
		clearanceNames := map[string]struct{}{}
		for _, c := range bundle.Cookies {
			clearanceNames[strings.TrimSpace(c.Name)] = struct{}{}
		}
		kept := make([]string, 0)
		for _, part := range strings.Split(existing, ";") {
			n, _, ok := strings.Cut(strings.TrimSpace(part), "=")
			if !ok {
				continue
			}
			if _, replace := clearanceNames[strings.TrimSpace(n)]; replace {
				continue
			}
			kept = append(kept, strings.TrimSpace(part))
		}
		kept = append(kept, parts...)
		headers["Cookie"] = strings.Join(kept, "; ")
	} else {
		headers["Cookie"] = cookieVal
	}
	return headers
}

// UpstreamClearanceStatusPublic is a redacted snapshot for admin UI (no cookie values).
type UpstreamClearanceStatusPublic struct {
	Enabled              bool     `json:"enabled"`
	EgressMode           string   `json:"egress_mode"`
	HasProxy             bool     `json:"has_proxy"`
	ProxySource          string   `json:"proxy_source"`
	ClearanceEnabled     bool     `json:"clearance_enabled"`
	ClearanceMode        string   `json:"clearance_mode"`
	HasClearanceBundle   bool     `json:"has_clearance_bundle"`
	CachedClearanceHosts []string `json:"cached_clearance_hosts"`
	FlareSolverrURL      string   `json:"flaresolverr_url"`
	RefreshIntervalSec   int      `json:"refresh_interval_sec"`
	BundleCreatedAt      string   `json:"bundle_created_at,omitempty"`
	BundleExpiresAt      string   `json:"bundle_expires_at,omitempty"`
	CookieCount          *int     `json:"cookie_count,omitempty"`
	HasUserAgent         *bool    `json:"has_user_agent,omitempty"`
}

// UpstreamClearanceWarmUpPublic is the public warm-up result.
type UpstreamClearanceWarmUpPublic struct {
	OK           bool   `json:"ok"`
	Error        string `json:"error,omitempty"`
	Status       string `json:"status,omitempty"`
	CookieCount  *int   `json:"cookie_count,omitempty"`
	Host         string `json:"host,omitempty"`
	HasUserAgent *bool  `json:"has_user_agent,omitempty"`
}

// UpstreamClearanceStatus returns a redacted snapshot for admin UI.
func UpstreamClearanceStatus() UpstreamClearanceStatusPublic {
	enabled := UpstreamClearanceEnabled()
	mode := upstreamClearanceMode()
	proxyURL := upstreamClearanceProxyURL()
	hosts := []string{}
	var newest *UpstreamClearanceBundle
	now := time.Now()

	upstreamClearanceMu.Lock()
	for _, b := range upstreamClearanceCache {
		if b == nil {
			continue
		}
		if b.TargetHost != "" {
			hosts = append(hosts, b.TargetHost)
		}
		if newest == nil || b.CreatedAt.After(newest.CreatedAt) {
			newest = b
		}
	}
	upstreamClearanceMu.Unlock()

	hasBundle := newest != nil && newest.validFor(newest.TargetHost, newest.ProxyURL, now)
	hasProxy := strings.TrimSpace(proxyURL) != ""
	status := UpstreamClearanceStatusPublic{
		Enabled:              enabled,
		EgressMode:           map[bool]string{true: "single_proxy", false: "direct"}[hasProxy],
		HasProxy:             hasProxy,
		ProxySource:          map[bool]string{true: "config", false: "none"}[hasProxy],
		ClearanceEnabled:     enabled && mode != "none",
		ClearanceMode:        mode,
		HasClearanceBundle:   hasBundle,
		CachedClearanceHosts: hosts,
		FlareSolverrURL:      upstreamFlareSolverrURL(),
		RefreshIntervalSec:   int(upstreamClearanceRefreshInterval().Seconds()),
	}
	if newest != nil {
		status.BundleCreatedAt = newest.CreatedAt.UTC().Format(time.RFC3339)
		if !newest.ExpiresAt.IsZero() {
			status.BundleExpiresAt = newest.ExpiresAt.UTC().Format(time.RFC3339)
		}
		cookieCount := len(newest.Cookies)
		hasUserAgent := strings.TrimSpace(newest.UserAgent) != ""
		status.CookieCount = &cookieCount
		status.HasUserAgent = &hasUserAgent
	}
	return status
}

// WarmUpUpstreamClearance fetches clearance if enabled (best-effort, used after enable/save).
func WarmUpUpstreamClearance(ctx context.Context) (UpstreamClearanceWarmUpPublic, error) {
	bundle, err := GetUpstreamClearance(ctx, true)
	if err != nil {
		return UpstreamClearanceWarmUpPublic{OK: false, Error: err.Error()}, err
	}
	if bundle == nil {
		return UpstreamClearanceWarmUpPublic{OK: false, Status: "disabled"}, nil
	}
	cookieCount := len(bundle.Cookies)
	hasUserAgent := strings.TrimSpace(bundle.UserAgent) != ""
	return UpstreamClearanceWarmUpPublic{
		OK: true, Status: "ok", CookieCount: &cookieCount,
		Host: bundle.TargetHost, HasUserAgent: &hasUserAgent,
	}, nil
}
