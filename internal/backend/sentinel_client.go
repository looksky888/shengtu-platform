package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	_ "time/tzdata"

	"chatgpt2api/internal/service"
)

type sentinelContext struct {
	ID        string            `json:"context_id"`
	P         string            `json:"p"`
	UserAgent string            `json:"user_agent"`
	Timezone  string            `json:"timezone"`
	Offset    int               `json:"timezone_offset_min"`
	Language  string            `json:"language"`
	Headers   map[string]string `json:"headers"`
	ProxyHash string            `json:"proxy_hash"`
}

// This private client never uses the upstream proxy/cookie jar or follows redirects.
var sentinelHTTPClient = &http.Client{
	Timeout:       45 * time.Second,
	Transport:     &http.Transport{MaxIdleConns: 8, MaxIdleConnsPerHost: 8, IdleConnTimeout: 90 * time.Second},
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
}

func callSentinelSolver(ctx context.Context, path string, body, result any) error {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("CHATGPT2API_SENTINEL_SOLVER_URL")), "/")
	key := strings.TrimSpace(os.Getenv("CHATGPT2API_SENTINEL_SOLVER_KEY"))
	parsed, err := url.Parse(base)
	if err != nil || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || len(key) < 32 {
		return fmt.Errorf("private sentinel solver URL and strong key are required")
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("encode solver request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("invalid solver request")
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := sentinelHTTPClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("private sentinel solver connection failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("private sentinel solver failed: HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 {
		return fmt.Errorf("invalid solver response size")
	}
	if err := json.Unmarshal(raw, result); err != nil {
		return fmt.Errorf("invalid solver response JSON")
	}
	return nil
}

func (c *Client) prepareSentinelContext(ctx context.Context) error {
	var profile sentinelContext
	request := map[string]string{"proxy_url": c.proxyURL, "timezone": c.proxyTimezone}
	if err := callSentinelSolver(ctx, "/v1/context", request, &profile); err != nil {
		return err
	}
	fields, err := decodeRequirementsConfig(profile.P)
	if err != nil {
		return err
	}
	if profile.ID == "" || profile.UserAgent == "" || fields[4] != profile.UserAgent || profile.Language == "" || fields[7] != profile.Language || profile.Offset < -840 || profile.Offset > 840 {
		return fmt.Errorf("inconsistent solver browser profile")
	}
	location, err := time.LoadLocation(profile.Timezone)
	if err != nil || profile.Timezone == "" {
		return fmt.Errorf("invalid solver timezone")
	}
	_, offset := time.Now().In(location).Zone()
	if profile.Offset != -offset/60 {
		return fmt.Errorf("solver timezone offset mismatch")
	}
	if profile.ProxyHash != service.ProxyURLHash(c.proxyURL) {
		return fmt.Errorf("solver and main upstream proxy configurations differ")
	}
	if c.proxyTimezone != "" && profile.Timezone != c.proxyTimezone {
		return fmt.Errorf("solver and account proxy timezones differ")
	}
	c.sentinel = &profile
	c.userAgent = profile.UserAgent
	platform := strings.ToLower(strings.Trim(profile.Headers["sec-ch-ua-platform"], "\""))
	c.fp["impersonate"] = "chrome-" + platform
	c.httpClient = service.BrowserHTTPClientForProxyWithProfile(c.proxyURL, c.fp["impersonate"], 300*time.Second)
	return nil
}

func (c *Client) applySentinelHeaders(headers map[string]string) {
	if c.sentinel == nil {
		return
	}
	headers["User-Agent"] = c.sentinel.UserAgent
	headers["Accept-Language"] = c.sentinel.Language
	headers["OAI-Language"] = c.sentinel.Language
	for _, key := range []string{"sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-ch-ua-arch", "sec-ch-ua-bitness", "sec-ch-ua-full-version", "sec-ch-ua-full-version-list", "sec-ch-ua-platform-version"} {
		// Remove case variants before installing the actual browser client hints.
		for present := range headers {
			if strings.EqualFold(present, key) {
				delete(headers, present)
			}
		}
		if value := c.sentinel.Headers[key]; value != "" {
			headers[http.CanonicalHeaderKey(key)] = value
		}
	}
}

func (c *Client) imageTimezone() (string, int) {
	if c.sentinel != nil {
		return c.sentinel.Timezone, c.sentinel.Offset
	}
	return "Asia/Shanghai", -480 // Existing direct-call defaults; conversation entry initializes the browser profile first.
}
