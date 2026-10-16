package service

import (
	"bytes"
	"chatgpt2api/internal/util"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (w *registerWorker) requestRawJSON(ctx context.Context, method, target string, body []byte, headers map[string]string) (int, map[string]any, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(body))
		if err != nil {
			return 0, nil, err
		}
		for key, value := range headers {
			if strings.TrimSpace(value) != "" {
				req.Header.Set(key, value)
			}
		}
		resp, err := w.client.Do(req)
		if err != nil {
			lastErr = err
			if attempt < 2 {
				if !registerRetrySleep(ctx, attempt) {
					return 0, nil, ctx.Err()
				}
				continue
			}
			return 0, nil, err
		}
		defer resp.Body.Close()
		payload := map[string]any{}
		_ = util.DecodeJSON(resp.Body, &payload)
		return resp.StatusCode, payload, nil
	}
	if lastErr != nil {
		return 0, nil, lastErr
	}
	return 0, nil, fmt.Errorf("raw request failed")
}

func (w *registerWorker) request(ctx context.Context, method, target string, payload any, headers map[string]string, followRedirects bool) (int, map[string]any, error) {
	status, payloadMap, _, err := w.requestDetailed(ctx, method, target, payload, headers, followRedirects)
	return status, payloadMap, err
}

func (w *registerWorker) requestDetailed(ctx context.Context, method, target string, payload any, headers map[string]string, followRedirects bool) (int, map[string]any, http.Header, error) {
	w.applyCachedCloudflareClearance(target)
	var body io.Reader
	var bodyData []byte
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, nil, err
		}
		bodyData = data
	}
	client := w.client
	if !followRedirects {
		noRedirect := *w.client
		noRedirect.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
		client = &noRedirect
	}
	var lastErr error
	clearanceRetried := false
	for attempt := 0; attempt < 3; attempt++ {
		if payload != nil {
			body = bytes.NewReader(bodyData)
		} else {
			body = nil
		}
		req, err := http.NewRequestWithContext(ctx, method, target, body)
		if err != nil {
			return 0, nil, nil, err
		}
		for key, value := range w.headersWithClearance(headers) {
			if strings.TrimSpace(value) != "" {
				req.Header.Set(key, value)
			}
		}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			if attempt < 2 {
				if !registerRetrySleep(ctx, attempt) {
					return 0, nil, nil, ctx.Err()
				}
				continue
			}
			return 0, nil, nil, err
		}
		defer resp.Body.Close()
		payloadMap := map[string]any{}
		if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
			_ = util.DecodeJSON(resp.Body, &payloadMap)
		} else {
			data, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
			if len(data) > 0 {
				payloadMap["body"] = string(data)
			}
		}
		if registerIsCloudflareChallenge(resp.StatusCode, payloadMap) && !clearanceRetried {
			clearanceRetried = true
			if refreshErr := w.refreshCloudflareClearance(ctx, target); refreshErr == nil {
				continue
			} else {
				payloadMap["clearance_error"] = refreshErr.Error()
			}
		}
		if resp.Request != nil && resp.Request.URL != nil {
			w.lastFinalURL = resp.Request.URL.String()
		} else {
			w.lastFinalURL = target
		}
		return resp.StatusCode, payloadMap, resp.Header.Clone(), nil
	}
	if lastErr != nil {
		return 0, nil, nil, lastErr
	}
	return 0, nil, nil, fmt.Errorf("request failed")
}

// registerRetrySleep uses short progressive backoff (300ms, 600ms) instead of fixed 1s sleeps.
func registerRetrySleep(ctx context.Context, attempt int) bool {
	delay := time.Duration(attempt+1) * 300 * time.Millisecond
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (w *registerWorker) navigateHeaders(referer string) map[string]string {
	headers := map[string]string{
		"Accept":                      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language":             "en-US,en;q=0.9",
		"Upgrade-Insecure-Requests":   "1",
		"User-Agent":                  registerUserAgent,
		"sec-ch-ua":                   registerSecCHUA,
		"sec-ch-ua-arch":              `"x86_64"`,
		"sec-ch-ua-bitness":           `"64"`,
		"sec-ch-ua-full-version-list": registerSecCHUAFullVersionList,
		"sec-ch-ua-mobile":            "?0",
		"sec-ch-ua-model":             `""`,
		"sec-ch-ua-platform":          `"Windows"`,
		"sec-ch-ua-platform-version":  `"10.0.0"`,
		"sec-fetch-dest":              "document",
		"sec-fetch-mode":              "navigate",
		"sec-fetch-site":              "same-origin",
		"sec-fetch-user":              "?1",
	}
	if referer != "" {
		headers["Referer"] = referer
	}
	return headers
}

func (w *registerWorker) platformOAuthTokenHeaders() map[string]string {
	return map[string]string{
		"Accept":             "*/*",
		"Accept-Language":    "zh-CN,zh;q=0.9",
		"Auth0-Client":       registerPlatformAuth0Client,
		"Cache-Control":      "no-cache",
		"Content-Type":       "application/json",
		"Origin":             registerPlatformBase,
		"Pragma":             "no-cache",
		"Priority":           "u=1, i",
		"Referer":            registerPlatformBase + "/",
		"Sec-CH-UA":          registerSecCHUA,
		"Sec-CH-UA-Mobile":   "?0",
		"Sec-CH-UA-Platform": `"Windows"`,
		"Sec-Fetch-Dest":     "empty",
		"Sec-Fetch-Mode":     "cors",
		"Sec-Fetch-Site":     "same-site",
		"User-Agent":         registerUserAgent,
	}
}

func (w *registerWorker) jsonHeaders(referer string) map[string]string {
	headers := map[string]string{
		"Accept":                      "application/json",
		"Accept-Language":             "en-US,en;q=0.9",
		"Content-Type":                "application/json",
		"Origin":                      registerAuthBase,
		"priority":                    "u=1, i",
		"User-Agent":                  registerUserAgent,
		"oai-device-id":               w.deviceID,
		"sec-ch-ua":                   registerSecCHUA,
		"sec-ch-ua-arch":              `"x86_64"`,
		"sec-ch-ua-bitness":           `"64"`,
		"sec-ch-ua-full-version-list": registerSecCHUAFullVersionList,
		"sec-ch-ua-mobile":            "?0",
		"sec-ch-ua-model":             `""`,
		"sec-ch-ua-platform":          `"Windows"`,
		"sec-ch-ua-platform-version":  `"10.0.0"`,
		"sec-fetch-dest":              "empty",
		"sec-fetch-mode":              "cors",
		"sec-fetch-site":              "same-origin",
	}
	for key, value := range registerTraceHeaders() {
		headers[key] = value
	}
	if referer != "" {
		headers["Referer"] = referer
	}
	return headers
}
