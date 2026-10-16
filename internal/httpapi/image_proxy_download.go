package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

const maxProxyDownloadedImageBytes = 64 << 20

// downloadProxyImageURL fetches a remote image and stores it in the local gallery.
// Strategy: try without auth first (public CDN), then retry with Bearer on 401/403
// or transport failure when apiKey is configured (relay-hosted media).
func (a *App) downloadProxyImageURL(ctx context.Context, imageURL string, request map[string]any, timeoutSeconds int, apiKey, proxyBase string) (string, string, error) {
	// Public CDN fetch (no API key): still block private/loopback targets.
	if err := validateOutboundProxyURL(imageURL, proxyBase, false); err != nil {
		return "", "", fmt.Errorf("图片 URL 不安全: %w", err)
	}
	parsed, err := url.Parse(strings.TrimSpace(imageURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", "", errors.New("图片 URL 无效")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", "", err
	}
	if timeoutSeconds <= 0 {
		timeoutSeconds = a.config.ImageProxyTimeoutSeconds()
	}
	apiKey = strings.TrimSpace(apiKey)
	baseClient := a.proxyHTTPClientWithTimeout(timeoutSeconds)
	publicClient := ssrfSafeHTTPClient(baseClient, proxyBase, false)

	// 1) Prefer unauthenticated fetch (public CDN URLs).
	// 2) On 401/403, retry with Bearer only when URL is on the configured proxy host.
	data, contentType, status, err := doProxyImageGET(publicClient, req)
	if err == nil && status >= 200 && status < 300 && len(data) > 0 {
		return a.saveDownloadedProxyImage(data, contentType, parsed.Path, request)
	}
	if apiKey != "" && (status == http.StatusUnauthorized || status == http.StatusForbidden || err != nil) {
		if keyErr := validateOutboundProxyURL(parsed.String(), proxyBase, true); keyErr != nil {
			if err != nil {
				return "", "", err
			}
			return "", "", fmt.Errorf("图片下载失败：HTTP %d（且不允许向该主机携带中转密钥）", status)
		}
		req2, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
		if reqErr != nil {
			return "", "", reqErr
		}
		req2.Header.Set("Authorization", "Bearer "+apiKey)
		keyClient := ssrfSafeHTTPClient(baseClient, proxyBase, true)
		data2, contentType2, status2, err2 := doProxyImageGET(keyClient, req2)
		if err2 == nil && status2 >= 200 && status2 < 300 && len(data2) > 0 {
			return a.saveDownloadedProxyImage(data2, contentType2, parsed.Path, request)
		}
		if err2 != nil {
			return "", "", err2
		}
		return "", "", fmt.Errorf("图片下载失败：HTTP %d", status2)
	}
	if err != nil {
		return "", "", err
	}
	return "", "", fmt.Errorf("图片下载失败：HTTP %d", status)
}

func doProxyImageGET(client *http.Client, req *http.Request) (data []byte, contentType string, status int, err error) {
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", 0, err
	}
	defer resp.Body.Close()
	status = resp.StatusCode
	if status < 200 || status >= 300 {
		return nil, "", status, nil
	}
	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, maxProxyDownloadedImageBytes+1))
	if readErr != nil {
		return nil, "", status, readErr
	}
	if len(raw) == 0 {
		return nil, "", status, errors.New("图片下载内容为空")
	}
	if len(raw) > maxProxyDownloadedImageBytes {
		return nil, "", status, errors.New("图片下载超过大小限制")
	}
	contentType = proxyImageContentType(resp.Header.Get("Content-Type"), raw)
	if !strings.HasPrefix(contentType, "image/") {
		return nil, contentType, status, errors.New("下载内容不是图片")
	}
	return raw, contentType, status, nil
}

func (a *App) saveDownloadedProxyImage(data []byte, contentType, rawPath string, request map[string]any) (string, string, error) {
	outputFormat := proxyImageOutputFormat(contentType, rawPath, util.Clean(request["output_format"]))
	localURL, err := a.engine.SaveImageBytesForOwnerWithFormat(
		data,
		util.Clean(request["base_url"]),
		util.Clean(request["owner_id"]),
		util.Clean(request["owner_name"]),
		outputFormat,
	)
	if err != nil {
		return "", "", err
	}
	if localURL == "" {
		return "", "", errors.New("保存下载图片失败")
	}
	return localURL, outputFormat, nil
}

func proxyImageContentType(headerValue string, data []byte) string {
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(headerValue, ";")[0]))
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = strings.ToLower(http.DetectContentType(data))
	}
	return contentType
}

func proxyImageOutputFormat(contentType, rawPath, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return "jpeg"
	case "image/webp":
		return "webp"
	case "image/png":
		return "png"
	}
	switch strings.ToLower(path.Ext(rawPath)) {
	case ".jpg", ".jpeg":
		return "jpeg"
	case ".webp":
		return "webp"
	case ".png":
		return "png"
	default:
		return protocol.NormalizeImageOutputFormat(fallback)
	}
}
