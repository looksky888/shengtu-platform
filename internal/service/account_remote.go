package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

const maxAccountRemoteResponseBytes = 32 << 20
const maxAccountRemoteAttempts = 3

func (s *AccountService) FetchRemoteInfo(ctx context.Context, accessToken string) (map[string]any, error) {
	accessToken = util.Clean(accessToken)
	if accessToken == "" {
		return nil, fmt.Errorf("请提供 access_token")
	}
	baseURL := strings.TrimRight(firstNonEmpty(s.remoteBaseURL, "https://chatgpt.com"), "/")
	headers := s.remoteHeadersContext(ctx, accessToken)
	client := s.browserHTTPClient(s.remoteImpersonation(accessToken), 30*time.Second)
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	if err := s.bootstrapRemote(ctx, client, baseURL, accessToken); err != nil {
		return nil, err
	}
	type response struct {
		payload map[string]any
		err     error
	}
	fetch := func(method, urlPath string, body any, extra map[string]string) response {
		var bodyData []byte
		if body != nil {
			data, err := json.Marshal(body)
			if err != nil {
				return response{err: fmt.Errorf("%s request body: %w", urlPath, err)}
			}
			bodyData = data
		}
		for attempt := 0; attempt < maxAccountRemoteAttempts; attempt++ {
			var reader io.Reader
			if bodyData != nil {
				reader = bytes.NewReader(bodyData)
			}
			req, err := http.NewRequestWithContext(ctx, method, baseURL+urlPath, reader)
			if err != nil {
				return response{err: fmt.Errorf("%s request: %w", urlPath, err)}
			}
			for key, value := range headers {
				req.Header.Set(key, value)
			}
			req.Header.Set("x-openai-target-path", urlPath)
			req.Header.Set("x-openai-target-route", urlPath)
			for key, value := range extra {
				req.Header.Set(key, value)
			}
			resp, err := client.Do(req)
			if err != nil {
				return response{err: err}
			}
			data, readErr := util.ReadAllLimited(resp.Body, maxAccountRemoteResponseBytes)
			resp.Body.Close()
			if readErr != nil {
				return response{err: readErr}
			}
			if resp.StatusCode == http.StatusOK {
				var payload map[string]any
				if err := json.Unmarshal(data, &payload); err != nil {
					return response{err: err}
				}
				return response{payload: payload}
			}
			requestErr := refreshHTTPError(urlPath, resp.StatusCode, data)
			if attempt+1 < maxAccountRemoteAttempts && isAccountCloudflareChallengeResponse(resp, data) {
				if attempt == 0 && UpstreamClearanceEnabled() {
					if bundle, refreshErr := RefreshUpstreamClearanceForChallenge(ctx); refreshErr == nil && bundle != nil {
						headers = ApplyUpstreamClearanceToHeaders(headers, bundle)
					}
				}
				if err := waitAccountRemoteRetry(ctx, time.Duration(attempt+1)*1500*time.Millisecond); err != nil {
					return response{err: err}
				}
				continue
			}
			return response{err: requestErr}
		}
		return response{err: fmt.Errorf("%s failed: Cloudflare clearance retry exhausted", urlPath)}
	}
	me := fetch(http.MethodGet, "/backend-api/me", nil, nil)
	if me.err != nil {
		return nil, me.err
	}
	init := fetch(http.MethodPost, "/backend-api/conversation/init", map[string]any{
		"gizmo_id": nil, "requested_default_model": nil, "conversation_id": nil, "timezone_offset_min": -480,
	}, nil)
	if init.err != nil {
		return nil, init.err
	}
	limits := anyList(init.payload["limits_progress"])
	accountType := s.detectAccountType(accessToken, me.payload, init.payload)
	existingType := util.Clean(s.GetAccount(accessToken)["type"])
	effectiveType := firstNonEmpty(accountType, existingType, "Free")
	quota, restoreAt, unknown := extractQuotaAndRestoreAt(limits)
	status := "正常"
	if !unknown && quota == 0 {
		status = "限流"
	}
	if unknown && effectiveType == "Free" {
		status = "限流"
	}
	return map[string]any{
		"email":               me.payload["email"],
		"user_id":             me.payload["id"],
		"type":                effectiveType,
		"quota":               quota,
		"image_quota_unknown": unknown,
		"limits_progress":     limits,
		"default_model_slug":  init.payload["default_model_slug"],
		"restore_at":          restoreAt,
		"status":              status,
	}, nil
}

func isAccountCloudflareChallengeResponse(resp *http.Response, body []byte) bool {
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		return false
	}
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(contentType, "json") {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(resp.Header.Get("CF-Mitigated")), "challenge") {
		return true
	}
	lower := strings.ToLower(string(body))
	return strings.Contains(contentType, "text/html") ||
		strings.Contains(lower, "cf_chl") ||
		strings.Contains(lower, "challenge-platform") ||
		strings.Contains(lower, "enable javascript and cookies to continue") ||
		strings.Contains(lower, "<title>just a moment")
}

func waitAccountRemoteRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (s *AccountService) bootstrapRemote(ctx context.Context, client *http.Client, baseURL, accessToken string) error {
	err := s.doBootstrapRemote(ctx, client, baseURL, accessToken)
	if err == nil {
		return nil
	}
	// Phase C: on Cloudflare challenge, force-refresh clearance once and retry (aligned with backend.Client.bootstrap).
	if !isCloudflareRefreshError(err) || !UpstreamClearanceEnabled() {
		return err
	}
	if _, refreshErr := RefreshUpstreamClearanceForChallenge(ctx); refreshErr != nil {
		return err
	}
	return s.doBootstrapRemote(ctx, client, baseURL, accessToken)
}

func (s *AccountService) doBootstrapRemote(ctx context.Context, client *http.Client, baseURL, accessToken string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/", nil)
	if err != nil {
		return fmt.Errorf("bootstrap request: %w", err)
	}
	headers := s.remoteBootstrapHeadersContext(ctx, accessToken)
	if bundle := CachedUpstreamClearance(); bundle != nil {
		headers = ApplyUpstreamClearanceToHeaders(headers, bundle)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, readErr := util.ReadAllLimited(resp.Body, maxAccountRemoteResponseBytes)
	if readErr != nil {
		return readErr
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return refreshHTTPError("bootstrap", resp.StatusCode, data)
	}
	return nil
}

func isCloudflareRefreshError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "cloudflare challenge") ||
		(strings.Contains(msg, "http 403") && strings.Contains(msg, "challenge")) ||
		(strings.Contains(msg, "status=403") && strings.Contains(msg, "challenge"))
}
func (s *AccountService) remoteHeaders(accessToken string) map[string]string {
	return s.remoteHeadersContext(context.Background(), accessToken)
}

func (s *AccountService) remoteHeadersContext(ctx context.Context, accessToken string) map[string]string {
	account := s.GetAccount(accessToken)
	clean := func(keys ...string) string {
		for _, key := range keys {
			if raw, ok := account["fp"].(map[string]any); ok {
				if value := util.Clean(raw[key]); value != "" {
					return value
				}
			}
			if value := util.Clean(account[key]); value != "" {
				return value
			}
		}
		return ""
	}
	headers := map[string]string{
		"authorization":      "Bearer " + accessToken,
		"accept":             "*/*",
		"accept-language":    "zh-CN,zh;q=0.9,en;q=0.8",
		"content-type":       "application/json",
		"oai-language":       "zh-CN",
		"origin":             "https://chatgpt.com",
		"referer":            "https://chatgpt.com/",
		"sec-fetch-dest":     "empty",
		"sec-fetch-mode":     "cors",
		"sec-fetch-site":     "same-origin",
		"user-agent":         firstNonEmpty(clean("user-agent", "user_agent"), defaultRemoteUserAgent),
		"sec-ch-ua":          firstNonEmpty(clean("sec-ch-ua"), defaultRemoteSecCHUA),
		"sec-ch-ua-mobile":   firstNonEmpty(clean("sec-ch-ua-mobile"), "?0"),
		"sec-ch-ua-platform": firstNonEmpty(clean("sec-ch-ua-platform"), `"Windows"`),
	}
	if deviceID := clean("oai-device-id", "oai_device_id"); deviceID != "" {
		headers["oai-device-id"] = deviceID
	}
	if sessionID := clean("oai-session-id", "oai_session_id"); sessionID != "" {
		headers["oai-session-id"] = sessionID
	}
	if bundle := CachedUpstreamClearance(); bundle != nil {
		headers = ApplyUpstreamClearanceToHeaders(headers, bundle)
	}
	return headers
}

func (s *AccountService) remoteBootstrapHeaders(accessToken string) map[string]string {
	return s.remoteBootstrapHeadersContext(context.Background(), accessToken)
}

func (s *AccountService) remoteBootstrapHeadersContext(ctx context.Context, accessToken string) map[string]string {
	account := s.GetAccount(accessToken)
	clean := func(keys ...string) string {
		for _, key := range keys {
			if raw, ok := account["fp"].(map[string]any); ok {
				if value := util.Clean(raw[key]); value != "" {
					return value
				}
			}
			if value := util.Clean(account[key]); value != "" {
				return value
			}
		}
		return ""
	}
	headers := map[string]string{
		"user-agent":                firstNonEmpty(clean("user-agent", "user_agent"), defaultRemoteUserAgent),
		"accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"accept-language":           "zh-CN,zh;q=0.9,en;q=0.8",
		"sec-ch-ua":                 firstNonEmpty(clean("sec-ch-ua"), defaultRemoteSecCHUA),
		"sec-ch-ua-mobile":          firstNonEmpty(clean("sec-ch-ua-mobile"), "?0"),
		"sec-ch-ua-platform":        firstNonEmpty(clean("sec-ch-ua-platform"), `"Windows"`),
		"sec-fetch-dest":            "document",
		"sec-fetch-mode":            "navigate",
		"sec-fetch-site":            "none",
		"sec-fetch-user":            "?1",
		"upgrade-insecure-requests": "1",
	}
	// Also inject on header build path for remote API calls after bootstrap when clearance is warm.
	if bundle := CachedUpstreamClearance(); bundle != nil {
		headers = ApplyUpstreamClearanceToHeaders(headers, bundle)
	}
	return headers
}

func (s *AccountService) remoteImpersonation(accessToken string) string {
	account := s.GetAccount(accessToken)
	if raw, ok := account["fp"].(map[string]any); ok {
		if value := util.Clean(raw["impersonate"]); value != "" {
			return value
		}
	}
	return firstNonEmpty(util.Clean(account["impersonate"]), defaultRemoteProfile)
}

func (s *AccountService) detectAccountType(accessToken string, mePayload, initPayload map[string]any) string {
	tokenPayload := decodeAccessTokenPayload(accessToken)
	tokenType := ""
	if authPayload, ok := tokenPayload["https://api.openai.com/auth"].(map[string]any); ok {
		tokenType = normalizeAccountType(authPayload["chatgpt_plan_type"])
	}
	runtimeType := detectRuntimeAccountType(mePayload, initPayload)
	if tokenType == "Free" && runtimeType != "" && runtimeType != "Free" {
		return runtimeType
	}
	if tokenType != "" {
		return tokenType
	}
	if runtimeType != "" {
		return runtimeType
	}
	if matched := searchAccountType(tokenPayload); matched != "" {
		return matched
	}
	return ""
}

func normalizeAccountType(value any) string {
	switch strings.ToLower(util.Clean(value)) {
	case "free":
		return "Free"
	case "plus", "personal":
		return "Plus"
	case "prolite", "pro_lite":
		return "ProLite"
	case "team", "business", "enterprise":
		return "Team"
	case "pro":
		return "Pro"
	default:
		return ""
	}
}

func searchAccountType(value any) string {
	switch x := value.(type) {
	case map[string]any:
		for key, item := range x {
			keyText := strings.ToLower(util.Clean(key))
			if strings.Contains(keyText, "plan") || strings.Contains(keyText, "type") || strings.Contains(keyText, "subscription") || strings.Contains(keyText, "workspace") || strings.Contains(keyText, "tier") {
				if matched := normalizeAccountType(item); matched != "" {
					return matched
				}
				if matched := searchAccountType(item); matched != "" {
					return matched
				}
			}
		}
	case []any:
		for _, item := range x {
			if matched := searchAccountType(item); matched != "" {
				return matched
			}
		}
	}
	return ""
}

func detectRuntimeAccountType(mePayload, initPayload map[string]any) string {
	for _, payload := range []any{mePayload, initPayload} {
		if matched := searchAccountType(payload); matched != "" {
			return matched
		}
	}
	if matched := inferPaidAccountTypeFromInit(initPayload); matched != "" {
		return matched
	}
	return ""
}

func inferPaidAccountTypeFromInit(initPayload map[string]any) string {
	defaultModel := strings.ToLower(util.Clean(initPayload["default_model_slug"]))
	if !strings.HasPrefix(defaultModel, "gpt-5-5") {
		return ""
	}
	quota, _, unknown := extractQuotaAndRestoreAt(anyList(initPayload["limits_progress"]))
	if unknown {
		return ""
	}
	if quota >= 100 {
		return "Plus"
	}
	return ""
}

func extractQuotaAndRestoreAt(limits []any) (int, any, bool) {
	for _, raw := range limits {
		item, ok := raw.(map[string]any)
		if !ok || item["feature_name"] != "image_gen" {
			continue
		}
		restore := any(nil)
		if value := util.Clean(item["reset_after"]); value != "" {
			restore = value
		}
		return util.ToInt(item["remaining"], 0), restore, false
	}
	return 0, nil, true
}
