package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

// formatProxyImageResult converts proxy responses into the application's image
// response shape and applies the configured local-download policy.
func (a *App) formatProxyImageResult(ctx context.Context, payload map[string]any, request map[string]any, cfgs ...imageProxyConfig) (map[string]any, error) {
	cfg := imageProxyConfig{
		BaseURL:        a.config.ImageProxyBaseURL(),
		DownloadURLs:   a.config.ImageProxyDownloadURLs(),
		TimeoutSeconds: a.config.ImageProxyTimeoutSeconds(),
	}
	if len(cfgs) > 0 {
		cfg = cfgs[0]
	}
	// When auto-save is on, every remote URL must land locally — no partial success, no silent remote fallback.
	// Applies to both GPT proxy and Grok (short-lived / auth-gated media).
	strictDownload := cfg.DownloadURLs
	data := proxyImageResultItems(payload)
	var b64Items []map[string]any
	var urlItems []map[string]any
	var downloadFailures []string
	downloadOK := 0
	for _, item := range data {
		if b64 := util.Clean(item["b64_json"]); b64 != "" {
			b64Items = append(b64Items, item)
			continue
		}
		if urlValue := util.Clean(item["url"]); urlValue != "" {
			resolvedURL := resolveProxyMediaURL(urlValue, cfg.BaseURL)
			urlItem := map[string]any{
				"url":            resolvedURL,
				"revised_prompt": firstNonEmpty(util.Clean(item["revised_prompt"]), util.Clean(request["prompt"])),
			}
			if cfg.DownloadURLs {
				localURL, outputFormat, err := a.downloadProxyImageURL(ctx, resolvedURL, request, cfg.TimeoutSeconds, cfg.APIKey, cfg.BaseURL)
				if err == nil && localURL != "" {
					urlItem["url"] = localURL
					urlItem["output_format"] = outputFormat
					urlItems = append(urlItems, urlItem)
					downloadOK++
					continue
				}
				downloadFailures = append(downloadFailures, firstNonEmpty(errString(err), "download failed"))
				if strictDownload {
					// Do not keep remote URLs that may 403 later.
					continue
				}
			}
			urlItems = append(urlItems, urlItem)
		}
	}
	created := int64(util.ToInt(payload["created"], int(time.Now().Unix())))
	// Partial multi-image download is a hard failure when strict save is enabled.
	if strictDownload && len(downloadFailures) > 0 {
		msg := fmt.Sprintf("中转站图片下载到本地失败：成功 %d，失败 %d", downloadOK, len(downloadFailures))
		if len(downloadFailures) > 0 {
			msg += "（" + downloadFailures[0] + "）"
		}
		return map[string]any{"created": created, "data": []any{}, "message": msg}, &protocol.ImageGenerationError{
			Message:    msg,
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "image_proxy_download_failed",
		}
	}
	if len(b64Items) == 0 && len(urlItems) == 0 {
		msg := "中转站未返回可用图片"
		if len(downloadFailures) > 0 {
			msg = "中转站图片下载到本地失败：" + downloadFailures[0]
		}
		return map[string]any{"created": created, "data": []any{}, "message": msg}, &protocol.ImageGenerationError{
			Message:    msg,
			StatusCode: http.StatusBadGateway,
			Type:       "server_error",
			Code:       "image_proxy_download_failed",
		}
	}
	if len(b64Items) > 0 {
		result, formatErr := a.engine.FormatImageResultWithOptions(b64Items, util.Clean(request["prompt"]), firstNonEmpty(util.Clean(request["response_format"]), "url"), util.Clean(request["base_url"]), util.Clean(request["owner_id"]), util.Clean(request["owner_name"]), created, "", protocol.ImageOutputOptionsFromPayload(request))
		if formatErr != nil {
			return nil, formatErr
		}
		if len(urlItems) > 0 {
			result["data"] = append(util.AsMapSlice(result["data"]), urlItems...)
		}
		if size := util.Clean(request["size"]); size != "" {
			result["size"] = size
		}
		return result, nil
	}
	out := map[string]any{"created": created, "data": urlItems}
	if size := util.Clean(request["size"]); size != "" {
		out["size"] = size
	}
	return out, nil
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func resolveProxyMediaURL(value, baseURL string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if parsed, err := url.Parse(value); err == nil && parsed.Scheme != "" {
		return value
	}
	base := strings.TrimRight(baseURL, "/")
	if base == "" {
		return value
	}
	parsed, err := url.Parse(base)
	if err != nil {
		return value
	}
	ref, err := url.Parse(value)
	if err != nil {
		return value
	}
	return parsed.ResolveReference(ref).String()
}
