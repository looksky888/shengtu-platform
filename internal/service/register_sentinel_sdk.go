package service

import (
	"bytes"
	"chatgpt2api/internal/util"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	registerSentinelSDKCacheTTL = 30 * time.Minute
	registerSentinelSDKMaxBytes = 4 << 20
)

//go:embed register_sentinel_sdk_runner.js
var registerSentinelSDKRunnerSource string

var (
	registerSentinelOfficialSDKEnabled = true
	registerSentinelSDKRunner          = runRegisterSentinelSDK
	registerSentinelSDKScriptRE        = regexp.MustCompile(`src=['"]([^'"]*(?:/sentinel/)[^'"]*/sdk\.js[^'"]*)['"]`)
	registerSentinelSDKAssetCache      = struct {
		sync.Mutex
		URL       string
		Source    string
		FetchedAt time.Time
	}{}
)

func (w *registerWorker) buildSentinelTokensWithOfficialSDK(ctx context.Context, flow string) (registerSentinelTokens, error) {
	ua := firstNonEmpty(strings.TrimSpace(w.clearanceUserAgent), registerUserAgent)
	sdkURL, sdkSource, err := w.loadSentinelSDKAssets(ctx, ua)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	prepareData, err := registerSentinelSDKRunner(ctx, map[string]any{
		"mode":       "prepare",
		"sdk_source": sdkSource,
		"sdk_url":    sdkURL,
		"device_id":  w.deviceID,
		"flow":       flow,
		"user_agent": ua,
	})
	if err != nil {
		return registerSentinelTokens{}, err
	}
	prepareToken := strings.TrimSpace(util.Clean(prepareData["prepare_token"]))
	if prepareToken == "" {
		return registerSentinelTokens{}, fmt.Errorf("sentinel_sdk_missing_prepare_token")
	}
	reqPayload := map[string]any{"p": prepareToken, "id": w.deviceID, "flow": flow}
	body, err := registerCompactJSONBytes(reqPayload)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	headers := registerSentinelHeaders()
	headers["User-Agent"] = ua
	status, payload, err := w.requestRawJSON(ctx, http.MethodPost, registerSentinelBase+"/backend-api/sentinel/req", body, headers)
	if err != nil {
		return registerSentinelTokens{}, err
	}
	challengeToken := strings.TrimSpace(util.Clean(payload["token"]))
	if status != http.StatusOK || challengeToken == "" {
		return registerSentinelTokens{}, fmt.Errorf("sentinel_req_failed_%d", status)
	}
	observerTimeout := int(registerSentinelSOObserverDelay / time.Millisecond)
	sdkData, err := registerSentinelSDKRunner(ctx, map[string]any{
		"mode":                "artifacts",
		"sdk_source":          sdkSource,
		"sdk_url":             sdkURL,
		"device_id":           w.deviceID,
		"flow":                flow,
		"user_agent":          ua,
		"prepare_token":       prepareToken,
		"req_data":            payload,
		"observer_timeout_ms": observerTimeout,
	})
	if err != nil {
		return registerSentinelTokens{}, err
	}
	token := strings.TrimSpace(util.Clean(sdkData["token"]))
	if token == "" {
		return registerSentinelTokens{}, fmt.Errorf("sentinel_sdk_missing_token")
	}
	diagnostic := registerSentinelSODiagnostic(payload)
	if strings.TrimSpace(util.Clean(sdkData["collector_error"])) != "" || strings.TrimSpace(util.Clean(sdkData["so_error"])) != "" {
		diagnostic = firstNonEmpty(diagnostic, "so=unknown") + ",sdk_error=yes"
	}
	return registerSentinelTokens{
		Token:        token,
		SOToken:      strings.TrimSpace(util.Clean(sdkData["so_token"])),
		SDK:          sdkURL,
		Source:       "official_sdk",
		SODiagnostic: diagnostic,
		OAISCValue:   "0" + challengeToken,
	}, nil
}

func (w *registerWorker) loadSentinelSDKAssets(ctx context.Context, userAgent string) (string, string, error) {
	now := time.Now()
	registerSentinelSDKAssetCache.Lock()
	cachedURL := registerSentinelSDKAssetCache.URL
	cachedSource := registerSentinelSDKAssetCache.Source
	cachedAt := registerSentinelSDKAssetCache.FetchedAt
	registerSentinelSDKAssetCache.Unlock()
	if cachedURL != "" && cachedSource != "" && now.Sub(cachedAt) < registerSentinelSDKCacheTTL {
		return cachedURL, cachedSource, nil
	}

	frameURL := registerSentinelBase + "/backend-api/sentinel/frame.html"
	frameStatus, frameHTML, err := w.requestSentinelText(ctx, frameURL, registerSentinelFrameHeaders(userAgent, ""))
	if err != nil {
		return "", "", err
	}
	rawSDKURL := registerExtractSentinelSDKURL(frameHTML)
	sdkURL := registerSentinelAbsoluteSDKURL(rawSDKURL)
	if frameStatus == http.StatusOK && rawSDKURL != "" && sdkURL == "" {
		if cachedURL != "" && cachedSource != "" {
			return cachedURL, cachedSource, nil
		}
		return "", "", fmt.Errorf("sentinel_sdk_url_rejected")
	}
	if frameStatus != http.StatusOK || sdkURL == "" {
		if cachedURL != "" && cachedSource != "" {
			return cachedURL, cachedSource, nil
		}
		return "", "", fmt.Errorf("sentinel_frame_http_%d", frameStatus)
	}

	sourceStatus, sdkSource, err := w.requestSentinelText(ctx, sdkURL, registerSentinelFrameHeaders(userAgent, frameURL))
	if err != nil {
		return "", "", err
	}
	if sourceStatus != http.StatusOK || !strings.Contains(sdkSource, "SentinelSDK") {
		if cachedURL != "" && cachedSource != "" {
			return cachedURL, cachedSource, nil
		}
		return "", "", fmt.Errorf("sentinel_sdk_http_%d", sourceStatus)
	}

	registerSentinelSDKAssetCache.Lock()
	registerSentinelSDKAssetCache.URL = sdkURL
	registerSentinelSDKAssetCache.Source = sdkSource
	registerSentinelSDKAssetCache.FetchedAt = now
	registerSentinelSDKAssetCache.Unlock()
	return sdkURL, sdkSource, nil
}

func (w *registerWorker) requestSentinelText(ctx context.Context, target string, headers map[string]string) (int, string, error) {
	if w.client == nil {
		return 0, "", fmt.Errorf("register_http_client_missing")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return 0, "", err
	}
	for key, value := range headers {
		if strings.TrimSpace(value) != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := w.client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	data, readErr := io.ReadAll(io.LimitReader(resp.Body, registerSentinelSDKMaxBytes))
	if readErr != nil {
		return resp.StatusCode, "", readErr
	}
	return resp.StatusCode, string(data), nil
}

func registerSentinelFrameHeaders(userAgent, referer string) map[string]string {
	headers := map[string]string{
		"Accept":             "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language":    "en-US,en;q=0.9",
		"User-Agent":         firstNonEmpty(strings.TrimSpace(userAgent), registerUserAgent),
		"sec-ch-ua":          registerSecCHUA,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": `"Windows"`,
	}
	if referer != "" {
		headers["Referer"] = referer
		headers["Origin"] = registerSentinelBase
	}
	return headers
}

func registerExtractSentinelSDKURL(html string) string {
	match := registerSentinelSDKScriptRE.FindStringSubmatch(html)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

// registerSentinelSDKAllowedHosts pins the only hosts the Sentinel SDK may be
// loaded from. The SDK source is executed by Node's vm, which is not a security
// boundary, and the URL comes from upstream-controlled HTML, so anything outside
// this list must be refused instead of executed. The list mirrors the sibling
// solver allowlist in services/sentinel-solver/browser.py.
var registerSentinelSDKAllowedHosts = []string{
	"sentinel.openai.com",
	"cdn.oaistatic.com",
}

func registerSentinelSDKHostAllowed(host string) bool {
	host = registerNormalizeHost(host)
	if host == "" {
		return false
	}
	for _, allowed := range registerSentinelSDKAllowedHosts {
		if host == allowed {
			return true
		}
	}
	return false
}

// registerSentinelAbsoluteSDKURL resolves an SDK URL extracted from HTML and
// returns it only when it is an https URL on an allowlisted host. Anything else
// (plain http, a non-web scheme, credentials in the URL, foreign hosts) yields
// "" so the caller keeps its existing failure semantics and never executes the
// fetched script.
func registerSentinelAbsoluteSDKURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed == nil {
		return ""
	}
	if parsed.Scheme == "" {
		switch {
		case strings.HasPrefix(value, "//"):
			parsed, err = url.Parse("https:" + value)
		case strings.HasPrefix(value, "/"):
			parsed, err = url.Parse(registerSentinelBase + value)
		default:
			parsed, err = url.Parse(registerSentinelBase + "/" + value)
		}
	}
	if err != nil || parsed == nil || parsed.Scheme != "https" || parsed.User != nil {
		return ""
	}
	if !registerSentinelSDKHostAllowed(parsed.Hostname()) {
		return ""
	}
	return parsed.String()
}

func runRegisterSentinelSDK(ctx context.Context, payload map[string]any) (map[string]any, error) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return nil, fmt.Errorf("node_not_found")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	runCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	cmd := exec.CommandContext(runCtx, nodePath, "-e", registerSentinelSDKRunnerSource)
	cmd.Stdin = bytes.NewReader(body)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if runCtx.Err() != nil {
			return nil, runCtx.Err()
		}
		detail := strings.TrimSpace(firstNonEmpty(stderr.String(), stdout.String(), err.Error()))
		return nil, fmt.Errorf("sentinel_sdk_runner_failed: %s", registerSentinelShortText(detail, 500))
	}
	output := bytes.TrimSpace(stdout.Bytes())
	if len(output) == 0 {
		return map[string]any{}, nil
	}
	var result map[string]any
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (w *registerWorker) applySentinelCookie(value string) {
	value = strings.TrimSpace(value)
	if value == "" || w.client == nil || w.client.Jar == nil {
		return
	}
	for _, rawURL := range []string{"https://openai.com/", registerAuthBase + "/"} {
		target, err := url.Parse(rawURL)
		if err != nil || target == nil {
			continue
		}
		w.client.Jar.SetCookies(target, []*http.Cookie{{Name: "oai-sc", Value: value, Path: "/"}})
	}
}

func registerSentinelShortText(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if maxLen <= 0 || len(value) <= maxLen {
		return value
	}
	return value[:maxLen] + "...(truncated)"
}
