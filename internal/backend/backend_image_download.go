package backend

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/util"
)

func (c *Client) DownloadImageBytes(ctx context.Context, imageURLs []string) ([][]byte, error) {
	out := make([][]byte, 0, len(imageURLs))
	for _, rawURL := range imageURLs {
		imageURL := strings.TrimSpace(rawURL)
		if imageURL == "" {
			continue
		}
		data, err := c.downloadImageByteItem(ctx, imageURL)
		if err != nil {
			return nil, err
		}
		out = append(out, data)
	}
	return out, nil
}

func (c *Client) downloadImageByteItem(ctx context.Context, imageURL string) ([]byte, error) {
	const maxAttempts = 2
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 && !sleepWithinContext(ctx, imageResultRetryDelay()) {
			return nil, ctx.Err()
		}
		resp, err := c.openImageDownload(ctx, imageURL)
		if err != nil {
			lastErr = err
			continue
		}
		if isTransientDownloadStatus(resp.StatusCode) && attempt+1 < maxAttempts {
			_, _ = util.ReadAllLimited(resp.Body, maxBackendResponseBodyBytes)
			resp.Body.Close()
			continue
		}
		defer resp.Body.Close()
		data, readErr := readBackendResponseBody(resp, "image_download")
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, upstreamHTTPErrorWithResponse("image_download", resp, data)
		}
		return data, nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("image_download failed")
}

func (c *Client) openImageDownload(ctx context.Context, imageURL string) (*http.Response, error) {
	targetURL := imageURL
	if strings.HasPrefix(imageURL, "/") {
		targetURL = c.BaseURL + imageURL
	}
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("image_download url: %w", err)
	}
	if c.isBackendAPIURL(parsed) {
		targetPath := parsed.EscapedPath()
		if targetPath == "" {
			targetPath = parsed.Path
		}
		return c.doUpstreamRequest(ctx, c.httpClient, http.MethodGet, targetURL, targetPath, nil, c.headersContext(ctx, targetPath, map[string]string{"Accept": "*/*"}))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("image_download request: %w", err)
	}
	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, upstreamTransportError("image_download", err)
	}
	return resp, nil
}

func (c *Client) isBackendAPIURL(parsed *url.URL) bool {
	if parsed == nil || !strings.HasPrefix(parsed.Path, "/backend-api/") {
		return false
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Scheme, base.Scheme) && strings.EqualFold(parsed.Host, base.Host)
}

func isTransientDownloadStatus(status int) bool {
	return status == http.StatusTooManyRequests || status == http.StatusBadGateway || status == http.StatusServiceUnavailable || status == http.StatusGatewayTimeout || status >= 500
}

func (c *Client) resolveImageURLs(ctx context.Context, conversationID string, fileIDs, sedimentIDs []string) []string {
	var urls []string
	for _, fileID := range fileIDs {
		if fileID == "file_upload" {
			continue
		}
		if u := c.fileDownloadURL(ctx, conversationID, fileID); u != "" {
			urls = append(urls, u)
		}
	}
	if len(urls) > 0 || conversationID == "" {
		return urls
	}
	for _, sedimentID := range sedimentIDs {
		if u := c.attachmentDownloadURL(ctx, conversationID, sedimentID); u != "" {
			urls = append(urls, u)
		}
	}
	return urls
}

func (c *Client) fileDownloadURL(ctx context.Context, conversationID, fileID string) string {
	paths := make([]string, 0, 2)
	if strings.TrimSpace(conversationID) != "" {
		query := url.Values{}
		query.Set("conversation_id", conversationID)
		query.Set("inline", "false")
		paths = append(paths, "/backend-api/files/download/"+url.PathEscape(fileID)+"?"+query.Encode())
	}
	paths = append(paths, "/backend-api/files/"+url.PathEscape(fileID)+"/download")
	for _, path := range paths {
		for attempt := 0; attempt < 2; attempt++ {
			if attempt > 0 && !sleepWithinContext(ctx, imageResultRetryDelay()) {
				return ""
			}
			if resolved := c.downloadURL(ctx, path); resolved != "" {
				return resolved
			}
		}
	}
	return ""
}

func imageResultRetryDelay() time.Duration {
	raw := strings.TrimSpace(os.Getenv("CHATGPT2API_IMAGE_RESULT_RETRY_DELAY_MS"))
	if raw == "" {
		return 250 * time.Millisecond
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 {
		return 250 * time.Millisecond
	}
	delay := time.Duration(value * float64(time.Millisecond))
	if delay > 5*time.Second {
		return 5 * time.Second
	}
	return delay
}

func imageResultSettleDelay() time.Duration {
	return envDurationSeconds("CHATGPT2API_IMAGE_RESULT_SETTLE_SECONDS", 5*time.Second, 0, 120*time.Second)
}

func (c *Client) attachmentDownloadURL(ctx context.Context, conversationID, attachmentID string) string {
	path := "/backend-api/conversation/" + url.PathEscape(conversationID) + "/attachment/" + url.PathEscape(attachmentID) + "/download"
	return c.downloadURL(ctx, path)
}

func (c *Client) downloadURL(ctx context.Context, path string) string {
	targetPath := path
	if index := strings.IndexByte(targetPath, '?'); index >= 0 {
		targetPath = targetPath[:index]
	}
	resp, err := c.doUpstreamRequest(ctx, c.httpClient, http.MethodGet, c.BaseURL+path, path, nil, c.headersContext(ctx, targetPath, map[string]string{"Accept": "application/json"}))
	if err != nil {
		return ""
	}
	payload, err := readJSONResponse(resp, path)
	if err != nil {
		return ""
	}
	if u := util.Clean(payload["download_url"]); u != "" {
		return u
	}
	return util.Clean(payload["url"])
}
