package backend

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const maxBackendResponseBodyBytes = 32 << 20

func (c *Client) postJSON(ctx context.Context, path string, payload any, headers map[string]string, stream bool) (*http.Response, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%s request payload: %w", path, err)
	}
	return c.postRaw(ctx, path, data, headers, stream)
}

func (c *Client) postRaw(ctx context.Context, path string, data []byte, headers map[string]string, stream bool) (*http.Response, error) {
	return c.doUpstreamRequest(ctx, c.httpClient, http.MethodPost, c.BaseURL+path, path, data, headers)
}

func (c *Client) doUpstreamRequest(ctx context.Context, client *http.Client, method, targetURL, contextName string, data []byte, headers map[string]string) (*http.Response, error) {
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, targetURL, bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("%s request: %w", contextName, err)
		}
		for key, value := range headers {
			req.Header.Set(key, value)
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, upstreamTransportError(contextName, err)
		}
		if attempt == 0 && shouldRefreshCloudflare(resp) && service.UpstreamClearanceEnabled() {
			c.logCloudflareChallenge(contextName, resp, attempt)
			if bundle, refreshErr := service.RefreshUpstreamClearanceForChallengeWithProxy(ctx, c.proxyURL); refreshErr == nil && bundle != nil {
				headers = service.ApplyUpstreamClearanceToHeaders(headers, bundle)
				c.applySentinelHeaders(headers)
				if c.logger != nil {
					c.logger.Info("upstream clearance refreshed", "host", upstreamRequestHost(resp), "proxy_present", c.proxyURL != "", "proxy_hash", service.ProxyURLHash(c.proxyURL), "clearance_created_at", bundle.CreatedAt.UTC().Format(time.RFC3339), "clearance_expires_at", bundle.ExpiresAt.UTC().Format(time.RFC3339), "clearance_cookie_count", len(bundle.Cookies), "clearance_has_user_agent", strings.TrimSpace(bundle.UserAgent) != "")
				}
				resp.Body.Close()
				continue
			}
		}
		return resp, nil
	}
	return nil, fmt.Errorf("%s failed: Cloudflare clearance retry exhausted", contextName)
}

func (c *Client) logCloudflareChallenge(contextName string, resp *http.Response, attempt int) {
	if c == nil || c.logger == nil {
		return
	}
	c.logCloudflareChallengeBody(contextName, resp, attempt, cloudflareBodySummary(resp))
}

func (c *Client) logCloudflareChallengeBody(contextName string, resp *http.Response, attempt int, bodySummary string) {
	if c == nil || c.logger == nil {
		return
	}
	c.logger.Warning("upstream Cloudflare challenge detected", "context", contextName, "attempt", attempt+1, "host", upstreamRequestHost(resp), "proxy_present", c.proxyURL != "", "proxy_hash", service.ProxyURLHash(c.proxyURL), "impersonate", c.fp["impersonate"], "user_agent_hash", shortFingerprintHash(c.userAgent), "sec_ch_ua", shortHeaderValue(c.fp["sec-ch-ua"]), "cf_ray", strings.TrimSpace(resp.Header.Get("CF-Ray")), "body_summary", bodySummary)
}

func upstreamRequestHost(resp *http.Response) string {
	if resp != nil && resp.Request != nil && resp.Request.URL != nil {
		return resp.Request.URL.Hostname()
	}
	return ""
}

func shortFingerprintHash(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return fmt.Sprintf("%x", sum[:6])
}

func shortHeaderValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 120 {
		return value[:120] + "..."
	}
	return value
}

type bodyReadCloser struct {
	io.Reader
	io.Closer
}

func rewindResponseBody(resp *http.Response, preview []byte) {
	if resp == nil || resp.Body == nil {
		return
	}
	orig := resp.Body
	resp.Body = bodyReadCloser{
		Reader: io.MultiReader(bytes.NewReader(preview), orig),
		Closer: orig,
	}
}

func cloudflareBodySummary(resp *http.Response) string {
	if resp == nil || resp.Body == nil {
		return ""
	}
	preview, err := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	if err != nil {
		return ""
	}
	rewindResponseBody(resp, preview)
	return summarizeUpstreamErrorBody(preview)
}

// shouldRefreshCloudflare limits clearance refreshes to challenge-like HTML
// responses. JSON 403 responses (for example invalid credentials) must keep
// their original error semantics and must not trigger a clearance refresh.
func shouldRefreshCloudflare(resp *http.Response) bool {
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(resp.Header.Get("CF-Mitigated")), "challenge") {
		return true
	}
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if resp.Body == nil {
		return false
	}
	preview, err := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	if err != nil {
		return false
	}
	rewindResponseBody(resp, preview)
	lower := strings.ToLower(string(preview))
	challengeBody := strings.Contains(lower, "cf_chl") ||
		strings.Contains(lower, "challenge-platform") ||
		strings.Contains(lower, "enable javascript and cookies to continue") ||
		strings.Contains(lower, "<title>just a moment") ||
		strings.Contains(lower, "cloudflare challenge")
	if !challengeBody {
		return false
	}
	// Explicit challenge markers are sufficient even when an intermediary
	// serializes the challenge as JSON. Generic JSON 403 errors still retain
	// their original semantics and never trigger a clearance refresh.
	if strings.Contains(lower, "cloudflare challenge") ||
		strings.Contains(lower, "cf_chl") ||
		strings.Contains(lower, "challenge-platform") {
		return true
	}
	if !strings.Contains(contentType, "text/html") && !looksLikeHTMLBody(lower) {
		return false
	}
	return true
}

func ensureOK(resp *http.Response, context string) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	data, err := readBackendResponseBody(resp, context)
	if err != nil {
		return err
	}
	return upstreamHTTPErrorWithResponse(context, resp, data)
}

func ensureOKAndClose(resp *http.Response, context string) error {
	defer resp.Body.Close()
	return ensureOK(resp, context)
}

func readJSONResponse(resp *http.Response, context string) (map[string]any, error) {
	defer resp.Body.Close()
	data, err := readBackendResponseBody(resp, context)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, upstreamHTTPErrorWithResponse(context, resp, data)
	}
	var payload map[string]any
	if err = json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func readBackendResponseBody(resp *http.Response, context string) ([]byte, error) {
	if resp == nil || resp.Body == nil {
		return nil, fmt.Errorf("%s failed: empty response", context)
	}
	data, err := util.ReadAllLimited(resp.Body, maxBackendResponseBodyBytes)
	if err != nil {
		return nil, fmt.Errorf("%s failed: read response: %w", context, err)
	}
	return data, nil
}

// upstreamHTTPError reports an upstream HTTP failure and keeps the status
// classifiable through upstreamStatusError, so retry decisions never depend on
// the wording of the upstream body that is embedded in the message.
func upstreamHTTPError(context string, status int, body []byte) error {
	detail := summarizeUpstreamErrorBody(body)
	if detail == "" {
		return &upstreamHTTPStatusError{status: status, message: fmt.Sprintf("%s failed: status=%d", context, status)}
	}
	return &upstreamHTTPStatusError{status: status, message: fmt.Sprintf("%s failed: status=%d, %s", context, status, detail)}
}

func upstreamTransportError(context string, err error) error {
	if err == nil {
		return nil
	}
	if detail, ok := util.SummarizeUpstreamConnectionError(err.Error()); ok {
		return fmt.Errorf("%s failed: %s", context, detail)
	}
	return fmt.Errorf("%s failed: %w", context, err)
}

func summarizeUpstreamErrorBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	lower := strings.ToLower(text)
	if isCloudflareChallengeBody(lower) {
		return "upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy"
	}
	if looksLikeHTMLBody(lower) {
		return "upstream returned HTML error page"
	}
	const maxBodyDetail = 2048
	if len(text) > maxBodyDetail {
		return "body=" + text[:maxBodyDetail] + "...(truncated)"
	}
	return "body=" + text
}

func isCloudflareChallengeBody(lower string) bool {
	if len(lower) > 32768 {
		lower = lower[:32768]
	}
	return strings.Contains(lower, "cf_chl") ||
		strings.Contains(lower, "challenge-platform") ||
		strings.Contains(lower, "enable javascript and cookies to continue") ||
		strings.Contains(lower, "<title>just a moment") ||
		strings.Contains(lower, "cloudflare challenge")
}

func looksLikeHTMLBody(lower string) bool {
	return strings.Contains(lower, "<html") ||
		strings.Contains(lower, "<!doctype html") ||
		strings.Contains(lower, "<body")
}

func iterSSEPayloads(ctx context.Context, reader io.Reader, out chan<- string) error {
	return iterSSEPayloadsUntil(ctx, reader, out, nil)
}

func iterSSEPayloadsUntil(ctx context.Context, reader io.Reader, out chan<- string, shouldStop func(string) bool) error {
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 2048)
	for {
		n, err := reader.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			for {
				idx := bytes.IndexByte(buf, '\n')
				if idx < 0 {
					break
				}
				line := strings.TrimSpace(string(buf[:idx]))
				buf = buf[idx+1:]
				if strings.HasPrefix(line, "data:") {
					payload := strings.TrimSpace(line[5:])
					if payload != "" {
						select {
						case out <- payload:
						case <-ctx.Done():
							return ctx.Err()
						}
						if shouldStop != nil && shouldStop(payload) {
							return nil
						}
					}
				}
			}
		}
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
	}
}
