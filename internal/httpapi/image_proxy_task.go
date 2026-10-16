package httpapi

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/util"
)

var (
	proxyImageURLKeys       = []string{"url", "image_url", "output_url", "download_url", "result_url", "resultUrl"}
	proxyImageBase64Keys    = []string{"b64_json", "b64", "base64", "image_base64", "imageBase64", "base64_json"}
	proxyImageContainerKeys = []string{"data", "result", "results", "response", "payload", "content", "output", "outputs", "images", "image", "asset", "assets", "file", "files", "artifact", "artifacts", "items", "task", "job"}
	proxyImageTaskIDKeys    = []string{"task_id", "taskId", "id", "job_id", "jobId", "request_id", "requestId", "generation_id", "generationId"}
	proxyImagePollURLKeys   = []string{"poll_url", "pollUrl", "polling_url", "pollingUrl", "status_url", "statusUrl", "task_url", "taskUrl"}
	proxyImageStatusKeys    = []string{"status", "state", "task_status", "taskStatus"}
)

const (
	proxyImagePollInterval = 2 * time.Second
	proxyImagePollMaxSteps = 150
)

func (a *App) resolveProxyImagePayload(ctx context.Context, cfg imageProxyConfig, payload map[string]any, requestPath string) (map[string]any, error) {
	if len(proxyImageResultItems(payload)) > 0 {
		return payload, nil
	}
	if message := proxyImagePayloadError(payload); message != "" {
		return nil, &protocol.ImageGenerationError{Message: message, StatusCode: http.StatusBadGateway, Type: "server_error", Code: "image_proxy_failed"}
	}
	taskID := proxyImageStringByKeys(payload, proxyImageTaskIDKeys, 0)
	if taskID == "" {
		return payload, nil
	}
	return a.pollProxyImageTask(ctx, cfg, requestPath, taskID, proxyImagePollURL(payload, cfg, requestPath))
}

func (a *App) pollProxyImageTask(ctx context.Context, cfg imageProxyConfig, requestPath, taskID, explicitURL string) (map[string]any, error) {
	pollURLs := proxyImagePollURLs(cfg, requestPath, taskID, explicitURL)
	client := &http.Client{Timeout: time.Duration(clampPositive(cfg.TimeoutSeconds, 300)) * time.Second}
	if a != nil && a.config != nil {
		client = a.proxyHTTPClient()
	}
	var lastErr error
	for step := 0; step < proxyImagePollMaxSteps; step++ {
		for _, pollURL := range pollURLs {
			payload, err := fetchProxyImageTask(ctx, client, cfg.APIKey, pollURL, cfg.BaseURL)
			if err != nil {
				lastErr = err
				var imageErr *protocol.ImageGenerationError
				if errors.As(err, &imageErr) && (imageErr.Code == "image_proxy_poll_http_404" || imageErr.Code == "image_proxy_poll_http_405") {
					continue
				}
				return nil, err
			}
			if len(proxyImageResultItems(payload)) > 0 {
				return payload, nil
			}
			if message := proxyImagePayloadError(payload); message != "" {
				return nil, &protocol.ImageGenerationError{Message: message, StatusCode: http.StatusBadGateway, Type: "server_error", Code: "image_proxy_failed"}
			}
			if !proxyImageStatusPending(proxyImageStringByKeys(payload, proxyImageStatusKeys, 0)) {
				return nil, &protocol.ImageGenerationError{Message: "中转站图片任务已结束，但没有返回图片结果", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "image_proxy_empty_result"}
			}
		}
		timer := time.NewTimer(proxyImagePollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, &protocol.ImageGenerationError{Message: "中转站图片任务轮询超时", StatusCode: http.StatusGatewayTimeout, Type: "server_error", Code: "image_proxy_poll_timeout"}
}

func fetchProxyImageTask(ctx context.Context, client *http.Client, apiKey, pollURL, proxyBase string) (map[string]any, error) {
	// Poll always carries API key → host must be the configured proxy.
	if err := validateOutboundProxyURL(pollURL, proxyBase, true); err != nil {
		return nil, &protocol.ImageGenerationError{Message: "中转站轮询 URL 不安全：" + err.Error(), StatusCode: http.StatusBadGateway, Type: "server_error", Code: "image_proxy_poll_ssrf"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pollURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	safeClient := ssrfSafeHTTPClient(client, proxyBase, true)
	resp, err := safeClient.Do(req)
	if err != nil {
		return nil, &protocol.ImageGenerationError{
			Message: "中转站图片任务查询失败：" + err.Error(), StatusCode: http.StatusBadGateway,
			Type: "server_error", Code: "image_proxy_poll_transport", UpstreamHost: routeHost(pollURL),
		}
	}
	defer resp.Body.Close()
	payload, readErr := readProxyJSONResponse(resp)
	if readErr != nil {
		return nil, imageErrorWithResponseMetadata(readErr, resp, payload)
	}
	addImageResponseMetadata(payload, resp)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := &protocol.ImageGenerationError{
			Message:    proxyImageHTTPErrorMessage(payload, fmt.Sprintf("中转站图片任务查询失败：HTTP %d", resp.StatusCode)),
			StatusCode: http.StatusBadGateway, UpstreamHTTPStatus: resp.StatusCode,
			Type: "server_error", Code: fmt.Sprintf("image_proxy_poll_http_%d", resp.StatusCode),
		}
		return payload, imageErrorWithResponseMetadata(err, resp, payload)
	}
	return payload, nil
}

func proxyImageResultItems(value any) []map[string]any {
	var out []map[string]any
	proxyCollectImageResultItems(value, &out, 0)
	return out
}

func proxyCollectImageResultItems(value any, out *[]map[string]any, depth int) {
	if value == nil || depth > 6 {
		return
	}
	switch item := value.(type) {
	case string:
		if result := proxyImageItemFromString(item); len(result) > 0 {
			*out = append(*out, result)
		}
	case []any:
		for _, child := range item {
			proxyCollectImageResultItems(child, out, depth+1)
		}
	case []map[string]any:
		for _, child := range item {
			proxyCollectImageResultItems(child, out, depth+1)
		}
	case map[string]any:
		if result := proxyImageItemFromMap(item); len(result) > 0 {
			*out = append(*out, result)
		}
		for _, key := range proxyImageContainerKeys {
			proxyCollectImageResultItems(item[key], out, depth+1)
		}
	}
}

func proxyImageItemFromMap(item map[string]any) map[string]any {
	for _, key := range proxyImageBase64Keys {
		if b64 := proxyNormalizeBase64(util.Clean(item[key])); b64 != "" {
			return map[string]any{"b64_json": b64, "revised_prompt": util.Clean(item["revised_prompt"])}
		}
	}
	for _, key := range proxyImageURLKeys {
		if imageURL := strings.TrimSpace(util.Clean(item[key])); imageURL != "" {
			return map[string]any{"url": imageURL, "revised_prompt": util.Clean(item["revised_prompt"])}
		}
	}
	return nil
}

func proxyImageItemFromString(value string) map[string]any {
	text := strings.TrimSpace(value)
	if text == "" {
		return nil
	}
	if strings.HasPrefix(strings.ToLower(text), "data:image/") {
		return map[string]any{"url": text}
	}
	if strings.HasPrefix(strings.ToLower(text), "http://") || strings.HasPrefix(strings.ToLower(text), "https://") || strings.HasPrefix(text, "/") || strings.HasPrefix(text, "./") || strings.HasPrefix(text, "../") {
		return map[string]any{"url": text}
	}
	if b64 := proxyNormalizeBase64(text); b64 != "" {
		return map[string]any{"b64_json": b64}
	}
	return nil
}

func proxyNormalizeBase64(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if index := strings.Index(value, ","); strings.HasPrefix(strings.ToLower(value), "data:image/") && index >= 0 {
		value = value[index+1:]
	}
	value = strings.ReplaceAll(value, "\n", "")
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, " ", "")
	if len(value) < 64 {
		return ""
	}
	if _, err := base64.StdEncoding.DecodeString(value); err != nil {
		return ""
	}
	return value
}

func proxyImageStringByKeys(value any, keys []string, depth int) string {
	if value == nil || depth > 5 {
		return ""
	}
	switch item := value.(type) {
	case []any:
		for _, child := range item {
			if found := proxyImageStringByKeys(child, keys, depth+1); found != "" {
				return found
			}
		}
	case []map[string]any:
		for _, child := range item {
			if found := proxyImageStringByKeys(child, keys, depth+1); found != "" {
				return found
			}
		}
	case map[string]any:
		for _, key := range keys {
			if found := util.Clean(item[key]); found != "" {
				return found
			}
		}
		for _, key := range proxyImageContainerKeys {
			if found := proxyImageStringByKeys(item[key], keys, depth+1); found != "" {
				return found
			}
		}
	}
	return ""
}

func proxyImagePayloadError(payload map[string]any) string {
	if errObj := util.StringMap(payload["error"]); len(errObj) > 0 {
		if message := util.Clean(errObj["message"]); message != "" {
			return message
		}
	}
	status := strings.ToLower(proxyImageStringByKeys(payload, proxyImageStatusKeys, 0))
	if status == "failed" || status == "failure" || status == "error" || status == "cancelled" || status == "canceled" || status == "expired" {
		return firstNonEmpty(util.Clean(payload["message"]), util.Clean(payload["msg"]), "中转站图片任务失败")
	}
	return ""
}

func proxyImageHTTPErrorMessage(payload map[string]any, fallback string) string {
	message := firstNonEmpty(util.Clean(payload["message"]), util.Clean(payload["msg"]), fallback)
	if errObj := util.StringMap(payload["error"]); len(errObj) > 0 {
		message = firstNonEmpty(util.Clean(errObj["message"]), message)
	}
	return message
}

func proxyImageStatusPending(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "", "pending", "queued", "running", "processing", "in_progress", "created", "submitted":
		return true
	default:
		return false
	}
}

func proxyImagePollURL(payload map[string]any, cfg imageProxyConfig, requestPath string) string {
	value := proxyImageStringByKeys(payload, proxyImagePollURLKeys, 0)
	if value == "" {
		return ""
	}
	return resolveProxyMediaURL(value, proxyAPIURL(cfg.BaseURL, requestPath))
}

func proxyImagePollURLs(cfg imageProxyConfig, requestPath, taskID, explicitURL string) []string {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return nil
	}
	encoded := urlPathEscape(taskID)
	var urls []string
	if explicitURL != "" {
		urls = append(urls, explicitURL)
	}
	requestURL := proxyAPIURL(cfg.BaseURL, requestPath)
	urls = append(urls, strings.TrimRight(requestURL, "/")+"/"+encoded)
	if requestPath != "/images/generations" {
		urls = append(urls, strings.TrimRight(proxyAPIURL(cfg.BaseURL, "/images/generations"), "/")+"/"+encoded)
	}
	return uniqueStrings(urls)
}

func urlPathEscape(value string) string {
	replacer := strings.NewReplacer("%", "%25", "/", "%2F", "?", "%3F", "#", "%23", " ", "%20")
	return replacer.Replace(value)
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
