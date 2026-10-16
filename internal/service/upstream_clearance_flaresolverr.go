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
)

type flareSolverrCookieJSON struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Domain  string `json:"domain"`
	Path    string `json:"path"`
	Expires any    `json:"expires"`
}

type flareSolverrSolutionJSON struct {
	Cookies   []flareSolverrCookieJSON `json:"cookies"`
	UserAgent string                   `json:"userAgent"`
}

type flareSolverrResponseJSON struct {
	Status   string                   `json:"status"`
	Message  string                   `json:"message"`
	Solution flareSolverrSolutionJSON `json:"solution"`
}

func fetchFlareSolverrUpstreamClearance(ctx context.Context, flaresolverrURL, targetURL, proxyURL string, timeout, refreshInterval time.Duration) (*UpstreamClearanceBundle, error) {
	flaresolverrURL = strings.TrimRight(strings.TrimSpace(flaresolverrURL), "/")
	if flaresolverrURL == "" {
		return nil, fmt.Errorf("flaresolverr_url_empty")
	}
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	payload := map[string]any{
		"cmd":        "request.get",
		"url":        targetURL,
		"maxTimeout": int(timeout / time.Millisecond),
	}
	if proxyURL = strings.TrimSpace(proxyURL); proxyURL != "" {
		payload["proxy"] = map[string]string{"url": proxyURL}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout+15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, flaresolverrURL+"/v1", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: timeout + 15*time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("flaresolverr_http_%d: %s", resp.StatusCode, upstreamSnippet(string(respBody), 200))
	}
	var decoded flareSolverrResponseJSON
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return nil, fmt.Errorf("flaresolverr_decode: %w", err)
	}
	if !strings.EqualFold(decoded.Status, "ok") {
		return nil, fmt.Errorf("flaresolverr_status_%s: %s", decoded.Status, upstreamSnippet(decoded.Message, 200))
	}
	now := time.Now()
	bundle := &UpstreamClearanceBundle{
		TargetHost: upstreamHostFromURL(targetURL),
		ProxyURL:   proxyURL,
		UserAgent:  strings.TrimSpace(decoded.Solution.UserAgent),
		CreatedAt:  now,
	}
	if refreshInterval > 0 {
		bundle.ExpiresAt = now.Add(refreshInterval)
	}
	host := bundle.TargetHost
	for _, cookie := range decoded.Solution.Cookies {
		name := strings.TrimSpace(cookie.Name)
		value := strings.TrimSpace(cookie.Value)
		if name == "" || value == "" {
			continue
		}
		domain := strings.TrimSpace(cookie.Domain)
		if domain != "" && host != "" {
			d := strings.Trim(strings.ToLower(strings.TrimPrefix(domain, ".")), ".")
			if d != host && !strings.HasSuffix(host, "."+d) && !strings.HasSuffix(d, host) {
				if !strings.Contains(d, "openai") && !strings.Contains(d, "chatgpt") && !strings.Contains(host, d) {
					continue
				}
			}
		}
		bundle.Cookies = append(bundle.Cookies, UpstreamClearanceCookie{
			Name:   name,
			Value:  value,
			Domain: domain,
			Path:   firstNonEmpty(strings.TrimSpace(cookie.Path), "/"),
		})
	}
	if bundle.UserAgent == "" && len(bundle.Cookies) == 0 {
		return nil, fmt.Errorf("flaresolverr_no_clearance")
	}
	return bundle, nil
}

func upstreamSnippet(s string, n int) string {
	s = strings.TrimSpace(s)
	if n <= 0 || len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
