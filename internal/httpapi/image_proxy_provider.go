package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleImageProxyModels(w http.ResponseWriter, r *http.Request) {
	// RBAC: POST /api/settings/image-proxy/models
	if _, ok := a.requireIdentity(w, r, ""); !ok {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	baseURL := strings.TrimSpace(util.Clean(body["base_url"]))
	apiKey := strings.TrimSpace(util.Clean(body["api_key"]))
	if baseURL == "" || apiKey == "" {
		util.WriteError(w, http.StatusBadRequest, "请先填写中转站 URL 和 API Key")
		return
	}
	models, err := fetchProxyModels(r.Context(), a.proxyHTTPClient(), baseURL, apiKey, a.config.ImageProxyTimeoutSeconds())
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, modelsResponse[string]{Models: models})
}

func (a *App) runProxyImageGeneration(ctx context.Context, body map[string]any, images []protocol.UploadedImage, channels ...string) (map[string]any, error) {
	start := time.Now()
	channel := imageProviderProxyAPI
	if len(channels) > 0 && strings.TrimSpace(channels[0]) != "" {
		channel = strings.TrimSpace(channels[0])
	}
	// Grok models never use GPT image proxy — they route via grok-runtime / 号池 only.
	if util.IsGrokImageModel(util.Clean(body["model"])) {
		err := &protocol.ImageGenerationError{
			Message:    "Grok 生图仅支持号池（grok-runtime），不支持 GPT 中转站路径",
			StatusCode: http.StatusBadRequest,
			Type:       "invalid_request_error",
			Code:       "grok_proxy_removed",
		}
		a.recordProxyImageHealth(start, imageProxyConfig{Channel: channel}, "/images/generations", err)
		return map[string]any{"data": []any{}, "message": err.Error()}, err
	}
	cfg, err := a.imageProxyConfigFor(body, channel, util.Clean(body["model"]))
	if err != nil {
		a.recordProxyImageHealth(start, cfg, "/images/generations", err)
		return map[string]any{"data": []any{}, "message": err.Error()}, err
	}
	body = util.CopyMap(body)
	// A resolved channel model is authoritative. The request model is only the
	// studio-facing label and may collide with a local model or another channel.
	// Legacy global proxy requests keep their existing request-model behavior.
	body["model"] = proxyRequestModel(body, cfg)
	var result map[string]any
	requestPath := "/images/generations"
	client := ssrfSafeHTTPClient(a.proxyHTTPClientWithTimeout(cfg.TimeoutSeconds), cfg.BaseURL, true)
	attemptIndex := 0
	effectiveModel := util.Clean(body["model"])
	runErr := retryProxyRequest(ctx, cfg.MaxRetries, func() error {
		retryIndex := attemptIndex
		attemptIndex++
		var err error
		if len(images) > 0 {
			requestPath = "/images/edits"
			result, err = callProxyImageEdits(ctx, client, cfg, body, images)
		} else {
			requestPath = "/images/generations"
			result, err = callProxyImageGenerations(ctx, client, cfg, body)
		}
		setImageErrorAttempt(err, retryIndex, attemptIndex)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderProxyAPI, effectiveModel, routeHost(cfg.BaseURL), retryIndex, attemptIndex, result, err)
		return err
	})
	if runErr != nil {
		a.recordProxyImageHealth(start, cfg, requestPath, runErr)
		return map[string]any{"data": []any{}, "message": runErr.Error()}, runErr
	}
	if resolved, err := a.resolveProxyImagePayload(ctx, cfg, result, requestPath); err == nil {
		result = resolved
	} else {
		setImageErrorAttempt(err, max(0, attemptIndex-1), attemptIndex)
		reportImageProviderAttempt(ctx, service.ImageTaskProviderProxyAPI, effectiveModel, routeHost(cfg.BaseURL), max(0, attemptIndex-1), attemptIndex, result, err)
		a.recordProxyImageHealth(start, cfg, requestPath, err)
		return map[string]any{"data": []any{}, "message": err.Error()}, err
	}
	formatted, formatErr := a.formatProxyImageResult(ctx, result, body, cfg)
	if formatErr != nil {
		a.recordProxyImageHealth(start, cfg, requestPath, formatErr)
		return map[string]any{"data": []any{}, "message": formatErr.Error()}, formatErr
	}
	a.recordProxyImageHealth(start, cfg, requestPath, nil)
	return formatted, nil
}

type imageProxyConfig struct {
	Channel        string
	BaseURL        string
	APIKey         string
	Model          string
	TimeoutSeconds int
	MaxRetries     int
	DownloadURLs   bool
}

func (a *App) imageProxyConfigFor(body map[string]any, channel, requestModel string) (imageProxyConfig, error) {
	if strings.TrimSpace(util.Clean(body["channel_model_id"])) != "" {
		cfg := imageProxyConfig{
			Channel: channel, BaseURL: strings.TrimSpace(util.Clean(body["channel_base_url"])),
			APIKey: strings.TrimSpace(util.Clean(body["channel_api_key"])), Model: firstNonEmpty(strings.TrimSpace(util.Clean(body["effective_model"])), requestModel),
			TimeoutSeconds: util.ToInt(body["channel_timeout_seconds"], 300), MaxRetries: util.ToInt(body["channel_max_retries"], 0),
			DownloadURLs: util.ToBool(body["channel_download_urls"]),
		}
		if cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
			return cfg, &protocol.ImageGenerationError{Message: "所选中转站配置不完整", StatusCode: http.StatusBadRequest, Type: "invalid_request_error", Code: "image_channel_not_configured"}
		}
		return cfg, nil
	}
	cfg := imageProxyConfig{
		Channel:        imageProviderProxyAPI,
		BaseURL:        a.config.ImageProxyBaseURL(),
		APIKey:         a.config.ImageProxyAPIKey(),
		Model:          a.config.ImageProxyModel(),
		TimeoutSeconds: a.config.ImageProxyTimeoutSeconds(),
		MaxRetries:     a.config.ImageProxyMaxRetries(),
		DownloadURLs:   a.config.ImageProxyDownloadURLs(),
	}
	if cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
		return cfg, &protocol.ImageGenerationError{Message: "中转站接口未配置完整，请在设置里填写 URL、API Key 并选择模型", StatusCode: http.StatusBadRequest, Type: "invalid_request_error", Code: "image_proxy_not_configured"}
	}
	return cfg, nil
}

func (a *App) proxyHTTPClient() *http.Client {
	return a.proxyHTTPClientWithTimeout(a.config.ImageProxyTimeoutSeconds())
}

func (a *App) proxyHTTPClientWithTimeout(timeoutSeconds int) *http.Client {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}
	if a.proxy != nil {
		return a.proxy.HTTPClient(time.Duration(timeoutSeconds) * time.Second)
	}
	return &http.Client{Timeout: time.Duration(timeoutSeconds) * time.Second}
}

func callProxyImageGenerations(ctx context.Context, client *http.Client, cfg imageProxyConfig, body map[string]any) (map[string]any, error) {
	model := proxyRequestModel(body, cfg)
	payload := map[string]any{
		"model":           model,
		"prompt":          util.Clean(body["prompt"]),
		"n":               max(1, util.ToInt(body["n"], 1)),
		"response_format": firstNonEmpty(util.Clean(body["response_format"]), "url"),
	}
	copyProxyString(payload, body, "size")
	copyProxyString(payload, body, "quality")
	copyProxyString(payload, body, "output_format")
	if compression, ok := imageOutputCompressionFromBody(body["output_compression"]); ok {
		payload["output_compression"] = compression
	}
	if payload["prompt"] == "" {
		return nil, protocol.HTTPError{Status: http.StatusBadRequest, Message: "请填写提示词"}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("image proxy request payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, proxyAPIURL(cfg.BaseURL, "/images/generations"), bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	return doProxyImageRequest(client, req)
}

func callProxyImageEdits(ctx context.Context, client *http.Client, cfg imageProxyConfig, body map[string]any, images []protocol.UploadedImage) (map[string]any, error) {
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	model := proxyRequestModel(body, cfg)
	_ = writer.WriteField("model", model)
	_ = writer.WriteField("prompt", util.Clean(body["prompt"]))
	_ = writer.WriteField("n", fmt.Sprint(max(1, util.ToInt(body["n"], 1))))
	_ = writer.WriteField("response_format", firstNonEmpty(util.Clean(body["response_format"]), "url"))
	for _, key := range []string{"size", "quality", "output_format"} {
		if value := util.Clean(body[key]); value != "" {
			_ = writer.WriteField(key, value)
		}
	}
	if compression, ok := imageOutputCompressionFromBody(body["output_compression"]); ok {
		_ = writer.WriteField("output_compression", fmt.Sprint(compression))
	}
	for index, image := range images {
		if len(image.Data) == 0 {
			continue
		}
		name := firstNonEmpty(image.Filename, fmt.Sprintf("image-%d.png", index+1))
		part, err := writer.CreatePart(imagePartHeader("image", name, firstNonEmpty(image.ContentType, "image/png")))
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(image.Data); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, proxyAPIURL(cfg.BaseURL, "/images/edits"), &buffer)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return doProxyImageRequest(client, req)
}

func proxyRequestModel(body map[string]any, cfg imageProxyConfig) string {
	if strings.TrimSpace(util.Clean(body["channel_model_id"])) != "" {
		return strings.TrimSpace(cfg.Model)
	}
	requestModel := strings.TrimSpace(util.Clean(body["model"]))
	if requestModel != "" && !util.IsGrokImageModel(requestModel) {
		return requestModel
	}
	return strings.TrimSpace(cfg.Model)
}

func imagePartHeader(field, filename, contentType string) textproto.MIMEHeader {
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeQuotes(field), escapeQuotes(filename)))
	header.Set("Content-Type", contentType)
	return header
}

func escapeQuotes(value string) string {
	return strings.NewReplacer("\\", "\\\\", `"`, "\\\"").Replace(value)
}

func copyProxyString(dst, src map[string]any, key string) {
	if value := util.Clean(src[key]); value != "" {
		dst[key] = value
	}
}

func doProxyImageRequest(client *http.Client, req *http.Request) (map[string]any, error) {
	resp, err := client.Do(req)
	if err != nil {
		return nil, &protocol.ImageGenerationError{
			Message: "中转站生图请求失败：" + err.Error(), StatusCode: http.StatusBadGateway,
			Type: "server_error", Code: "image_proxy_transport_error", UpstreamHost: routeHost(req.URL.String()),
		}
	}
	defer resp.Body.Close()
	payload, readErr := readProxyJSONResponse(resp)
	if readErr != nil {
		return nil, imageErrorWithResponseMetadata(readErr, resp, payload)
	}
	addImageResponseMetadata(payload, resp)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return payload, imageErrorWithResponseMetadata(proxyImageError(resp.StatusCode, payload), resp, payload)
	}
	return payload, nil
}

func proxyImageError(status int, payload map[string]any) error {
	message := firstNonEmpty(util.Clean(payload["message"]), util.Clean(payload["msg"]), "中转站生图失败")
	if errObj := util.StringMap(payload["error"]); len(errObj) > 0 {
		message = firstNonEmpty(util.Clean(errObj["message"]), message)
	}
	errType := "server_error"
	if status == http.StatusTooManyRequests {
		errType = "rate_limit_error"
	}
	return &protocol.ImageGenerationError{
		Message: message, StatusCode: status, UpstreamHTTPStatus: status,
		Type: errType, Code: fmt.Sprintf("image_proxy_http_%d", status),
		UpstreamHost:      util.Clean(payload["upstream_host"]),
		UpstreamRequestID: firstNonEmpty(util.Clean(payload["upstream_request_id"]), proxyImageStringByKeys(payload, upstreamRequestIDKeys, 0)),
		UpstreamCFRay:     util.Clean(payload["upstream_cf_ray"]),
	}
}
