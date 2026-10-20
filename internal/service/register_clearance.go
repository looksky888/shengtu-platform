package service

import (
	"bytes"
	"chatgpt2api/internal/util"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type registerClearanceCookie struct {
	Name    string
	Value   string
	Domain  string
	Path    string
	Expires time.Time
}

type registerClearanceBundle struct {
	TargetHost string
	ProxyURL   string
	UserAgent  string
	Cookies    []registerClearanceCookie
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

type registerFlareSolverrCookie struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Domain  string `json:"domain"`
	Path    string `json:"path"`
	Expires any    `json:"expires"`
}

type registerFlareSolverrSolution struct {
	URL       string                       `json:"url"`
	Status    int                          `json:"status"`
	Cookies   []registerFlareSolverrCookie `json:"cookies"`
	UserAgent string                       `json:"userAgent"`
	Headers   map[string]any               `json:"headers"`
	Response  string                       `json:"response"`
}

type registerFlareSolverrResponse struct {
	Status   string                       `json:"status"`
	Message  string                       `json:"message"`
	Solution registerFlareSolverrSolution `json:"solution"`
}

// registerClearanceFlightState coalesces concurrent FlareSolverr refreshes for
// the same (target host, proxy) key. The mutex only guards the cache and the
// in-flight registry: the FlareSolverr request itself runs outside the lock, so
// one stalled FlareSolverr no longer serializes every register worker, and a
// waiting worker can still be cancelled through its own context.
type registerClearanceFlightState struct {
	done   chan struct{}
	bundle *registerClearanceBundle
	err    error
}

var (
	registerClearanceMu     sync.Mutex
	registerClearanceCache  = map[string]*registerClearanceBundle{}
	registerClearanceFlight = map[string]*registerClearanceFlightState{}
)

func (b *registerClearanceBundle) validFor(targetHost, proxyURL string, now time.Time) bool {
	if b == nil {
		return false
	}
	if host := registerNormalizeHost(targetHost); host != "" && registerNormalizeHost(b.TargetHost) != host {
		return false
	}
	if strings.TrimSpace(b.ProxyURL) != strings.TrimSpace(proxyURL) {
		return false
	}
	if !b.ExpiresAt.IsZero() && !now.Before(b.ExpiresAt) {
		return false
	}
	return strings.TrimSpace(b.UserAgent) != "" || len(b.Cookies) > 0
}

func registerIsCloudflareChallenge(status int, payload map[string]any) bool {
	if status != http.StatusForbidden && status != http.StatusServiceUnavailable {
		return false
	}
	body := strings.ToLower(util.Clean(payload["body"]))
	if body == "" {
		return false
	}
	return strings.Contains(body, "<title>just a moment") ||
		strings.Contains(body, "<title>attention required! | cloudflare") ||
		strings.Contains(body, "challenges.cloudflare.com") ||
		strings.Contains(body, "cf-chl-") ||
		strings.Contains(body, "__cf_chl_") ||
		strings.Contains(body, "cf-browser-verification")
}

func registerNormalizeHost(host string) string {
	return strings.Trim(strings.ToLower(strings.TrimSpace(host)), ".")
}

func registerHostFromURL(target string) string {
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
	return registerNormalizeHost(parsed.Hostname())
}

func registerClearanceCacheKey(targetHost, proxyURL string) string {
	return registerNormalizeHost(targetHost) + "|" + strings.TrimSpace(proxyURL)
}

func (w *registerWorker) manualClearanceBundle(target string) *registerClearanceBundle {
	cfg := w.clearanceConfig()
	ua := strings.TrimSpace(util.Clean(cfg["user_agent"]))
	cfClearance := strings.TrimSpace(util.Clean(cfg["cf_clearance"]))
	cfCookies := strings.TrimSpace(util.Clean(cfg["cf_cookies"]))
	if ua == "" && cfClearance == "" && cfCookies == "" {
		return nil
	}
	targetHost := registerHostFromURL(target)
	if targetHost == "" {
		targetHost = registerHostFromURL(registerAuthBase)
	}
	bundle := &registerClearanceBundle{TargetHost: targetHost, ProxyURL: w.clearanceProxy(), UserAgent: ua, CreatedAt: time.Now()}
	if cfClearance != "" {
		bundle.Cookies = append(bundle.Cookies, registerClearanceCookie{Name: "cf_clearance", Value: cfClearance, Domain: "." + targetHost, Path: "/"})
	}
	for _, part := range strings.Split(cfCookies, ";") {
		name, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && strings.TrimSpace(name) != "" && strings.TrimSpace(value) != "" {
			bundle.Cookies = append(bundle.Cookies, registerClearanceCookie{Name: strings.TrimSpace(name), Value: strings.TrimSpace(value), Domain: "." + targetHost, Path: "/"})
		}
	}
	return bundle
}

func (w *registerWorker) registerProxy() string {
	return strings.TrimSpace(util.Clean(w.config["proxy"]))
}

func (w *registerWorker) headersWithClearance(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers)+1)
	for key, value := range headers {
		out[key] = value
	}
	ua := strings.TrimSpace(w.clearanceUserAgent)
	if ua == "" {
		return out
	}
	set := false
	for key := range out {
		if strings.EqualFold(key, "user-agent") {
			out[key] = ua
			set = true
		}
	}
	if !set {
		out["User-Agent"] = ua
	}
	return out
}

func (w *registerWorker) applyCachedCloudflareClearance(target string) {
	if !w.clearanceEnabled() || w.clearanceMode() == "none" {
		return
	}
	if w.clearanceMode() == "manual" {
		w.applyCloudflareClearance(w.manualClearanceBundle(target))
		return
	}
	targetHost := registerHostFromURL(target)
	if targetHost == "" {
		return
	}
	proxyURL := w.clearanceProxy()
	key := registerClearanceCacheKey(targetHost, proxyURL)
	now := time.Now()
	registerClearanceMu.Lock()
	bundle := registerClearanceCache[key]
	valid := bundle.validFor(targetHost, proxyURL, now)
	registerClearanceMu.Unlock()
	if valid {
		w.applyCloudflareClearance(bundle)
	}
}

func (w *registerWorker) applyCloudflareClearance(bundle *registerClearanceBundle) {
	if bundle == nil {
		return
	}
	if ua := strings.TrimSpace(bundle.UserAgent); ua != "" {
		w.clearanceUserAgent = ua
	}
	if w.client == nil || w.client.Jar == nil || len(bundle.Cookies) == 0 {
		return
	}
	targetHost := firstNonEmpty(registerNormalizeHost(bundle.TargetHost), registerHostFromURL(registerAuthBase))
	targetURL, err := url.Parse("https://" + targetHost + "/")
	if err != nil || targetURL == nil {
		return
	}
	cookies := make([]*http.Cookie, 0, len(bundle.Cookies)*2)
	for _, item := range bundle.Cookies {
		name := strings.TrimSpace(item.Name)
		value := strings.TrimSpace(item.Value)
		if name == "" || value == "" {
			continue
		}
		path := firstNonEmpty(strings.TrimSpace(item.Path), "/")
		baseCookie := &http.Cookie{Name: name, Value: value, Path: path}
		if !item.Expires.IsZero() {
			baseCookie.Expires = item.Expires
		}
		if domain := strings.TrimSpace(item.Domain); domain != "" {
			domainCookie := *baseCookie
			domainCookie.Domain = domain
			cookies = append(cookies, &domainCookie)
		}
		hostCookie := *baseCookie
		cookies = append(cookies, &hostCookie)
	}
	if len(cookies) > 0 {
		w.client.Jar.SetCookies(targetURL, cookies)
	}
}

func (w *registerWorker) refreshCloudflareClearance(ctx context.Context, target string) error {
	if !w.clearanceEnabled() || w.clearanceMode() == "none" {
		w.step("Cloudflare challenge detected; clearance is disabled")
		return fmt.Errorf("cloudflare_clearance_disabled")
	}
	if w.clearanceMode() == "manual" {
		w.applyCloudflareClearance(w.manualClearanceBundle(target))
		w.step("Cloudflare challenge detected; applied manual clearance and retry")
		return nil
	}
	flaresolverrURL := w.clearanceFlareSolverrURL()
	if flaresolverrURL == "" {
		w.step("Cloudflare challenge detected; CHATGPT2API_FLARESOLVERR_URL is empty")
		return fmt.Errorf("flaresolverr_url_empty")
	}
	targetHost := registerHostFromURL(target)
	if targetHost == "" {
		targetHost = registerHostFromURL(registerAuthBase)
	}
	proxyURL := w.clearanceProxy()
	key := registerClearanceCacheKey(targetHost, proxyURL)
	now := time.Now()
	registerClearanceMu.Lock()
	if bundle := registerClearanceCache[key]; bundle.validFor(targetHost, proxyURL, now) && now.Sub(bundle.CreatedAt) < 30*time.Second {
		registerClearanceMu.Unlock()
		w.applyCloudflareClearance(bundle)
		w.step("Cloudflare challenge detected; reuse refreshed clearance and retry")
		return nil
	}
	if flight := registerClearanceFlight[key]; flight != nil {
		registerClearanceMu.Unlock()
		w.step("Cloudflare challenge detected; waiting for in-flight clearance refresh")
		select {
		case <-flight.done:
			if flight.err != nil {
				w.step("Cloudflare clearance refresh failed: " + flight.err.Error())
				return flight.err
			}
			w.applyCloudflareClearance(flight.bundle)
			w.step("Cloudflare challenge detected; reuse refreshed clearance and retry")
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	flight := &registerClearanceFlightState{done: make(chan struct{})}
	registerClearanceFlight[key] = flight
	registerClearanceMu.Unlock()

	w.step("Cloudflare challenge detected; refreshing clearance")
	clearanceTarget := "https://" + targetHost + "/"
	if targetHost == registerHostFromURL(registerAuthBase) {
		clearanceTarget = registerAuthBase
	}
	bundle, err := registerFetchFlareSolverrClearance(ctx, flaresolverrURL, clearanceTarget, proxyURL, w.clearanceTimeout(), w.clearanceRefreshInterval())

	registerClearanceMu.Lock()
	flight.bundle, flight.err = bundle, err
	if err == nil {
		registerClearanceCache[key] = bundle
	}
	delete(registerClearanceFlight, key)
	close(flight.done)
	registerClearanceMu.Unlock()

	if err != nil {
		w.step("Cloudflare clearance refresh failed: " + err.Error())
		return err
	}
	w.applyCloudflareClearance(bundle)
	w.step("Cloudflare clearance refreshed; retrying current request")
	return nil
}

func registerFetchFlareSolverrClearance(ctx context.Context, flaresolverrURL, targetURL, proxyURL string, timeout time.Duration, refreshInterval time.Duration) (*registerClearanceBundle, error) {
	flaresolverrURL = strings.TrimRight(strings.TrimSpace(flaresolverrURL), "/")
	if flaresolverrURL == "" {
		return nil, fmt.Errorf("flaresolverr_url_empty")
	}
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	requestPayload := map[string]any{
		"cmd":        "request.get",
		"url":        targetURL,
		"maxTimeout": int(timeout / time.Millisecond),
	}
	if proxyURL = strings.TrimSpace(proxyURL); proxyURL != "" {
		requestPayload["proxy"] = map[string]string{"url": proxyURL}
	}
	body, err := json.Marshal(requestPayload)
	if err != nil {
		return nil, err
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout+10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, flaresolverrURL+"/v1", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: timeout + 10*time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("flaresolverr_http_%d: %s", resp.StatusCode, registerSnippet(string(respBody), 240))
	}
	var decoded registerFlareSolverrResponse
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return nil, fmt.Errorf("flaresolverr_decode_failed: %w", err)
	}
	if !strings.EqualFold(decoded.Status, "ok") {
		return nil, fmt.Errorf("flaresolverr_status_%s: %s", decoded.Status, registerSnippet(decoded.Message, 240))
	}
	now := time.Now()
	bundle := &registerClearanceBundle{
		TargetHost: registerHostFromURL(targetURL),
		ProxyURL:   proxyURL,
		UserAgent:  strings.TrimSpace(decoded.Solution.UserAgent),
		CreatedAt:  now,
	}
	if refreshInterval > 0 {
		bundle.ExpiresAt = now.Add(refreshInterval)
	}
	for _, cookie := range decoded.Solution.Cookies {
		name := strings.TrimSpace(cookie.Name)
		value := strings.TrimSpace(cookie.Value)
		if name == "" || value == "" {
			continue
		}
		item := registerClearanceCookie{
			Name:   name,
			Value:  value,
			Domain: strings.TrimSpace(cookie.Domain),
			Path:   firstNonEmpty(strings.TrimSpace(cookie.Path), "/"),
		}
		if expires := registerCookieExpires(cookie.Expires); !expires.IsZero() {
			item.Expires = expires
			if bundle.ExpiresAt.IsZero() || expires.Before(bundle.ExpiresAt) {
				bundle.ExpiresAt = expires
			}
		}
		bundle.Cookies = append(bundle.Cookies, item)
	}
	if strings.TrimSpace(bundle.UserAgent) == "" && len(bundle.Cookies) == 0 {
		return nil, fmt.Errorf("flaresolverr_no_clearance_cookie")
	}
	return bundle, nil
}
