package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

var upstreamRequestIDKeys = []string{"request_id", "requestId", "x_request_id", "trace_id", "traceId"}

var imageAttemptContainerKeys = []string{"detail", "error", "meta", "metadata"}

var imageRetryIndexKeys = []string{"retry_index", "retryIndex"}

var imageAttemptCountKeys = []string{"attempt_count", "attemptCount"}

func imageErrorWithResponseMetadata(err error, resp *http.Response, payload map[string]any) error {
	if err == nil {
		return nil
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) || imageErr == nil {
		return err
	}
	if resp != nil {
		if imageErr.UpstreamHTTPStatus <= 0 {
			imageErr.UpstreamHTTPStatus = resp.StatusCode
		}
		if imageErr.UpstreamHost == "" && resp.Request != nil && resp.Request.URL != nil {
			imageErr.UpstreamHost = strings.ToLower(resp.Request.URL.Hostname())
		}
		if imageErr.UpstreamRequestID == "" {
			imageErr.UpstreamRequestID = firstNonEmptyHeader(resp.Header,
				"X-Request-ID", "Request-ID", "OpenAI-Request-ID", "X-Amzn-RequestId")
		}
		if imageErr.UpstreamCFRay == "" {
			imageErr.UpstreamCFRay = strings.TrimSpace(resp.Header.Get("CF-Ray"))
		}
	}
	if imageErr.UpstreamRequestID == "" {
		imageErr.UpstreamRequestID = proxyImageStringByKeys(payload, upstreamRequestIDKeys, 0)
	}
	return err
}

func addImageResponseMetadata(payload map[string]any, resp *http.Response) {
	if payload == nil || resp == nil {
		return
	}
	payload["upstream_http_status"] = resp.StatusCode
	if resp.Request != nil && resp.Request.URL != nil {
		if host := strings.ToLower(resp.Request.URL.Hostname()); host != "" {
			payload["upstream_host"] = host
		}
	}
	if requestID := firstNonEmptyHeader(resp.Header,
		"X-Request-ID", "Request-ID", "OpenAI-Request-ID", "X-Amzn-RequestId"); requestID != "" {
		payload["upstream_request_id"] = requestID
	} else if requestID := proxyImageStringByKeys(payload, upstreamRequestIDKeys, 0); requestID != "" {
		payload["upstream_request_id"] = requestID
	}
	if cfRay := strings.TrimSpace(resp.Header.Get("CF-Ray")); cfRay != "" {
		payload["upstream_cf_ray"] = cfRay
	}
}

func firstNonEmptyHeader(header http.Header, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(header.Get(key)); value != "" {
			return value
		}
	}
	return ""
}

func setImageErrorAttempt(err error, retryIndex, attemptCount int) {
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) || imageErr == nil {
		return
	}
	imageErr.RetryIndex = retryIndex
	imageErr.AttemptCount = attemptCount
}

func imageProviderAttemptCounts(evidence map[string]any, err error) (retryIndex, attemptCount int) {
	metadata := service.ImageTaskUpstreamMetadataFromError(err)
	retryIndex = metadata.RetryIndex
	attemptCount = metadata.AttemptCount
	if value, ok := imageAttemptIntegerByKeys(evidence, imageRetryIndexKeys, 0); ok {
		retryIndex = value
	}
	if value, ok := imageAttemptIntegerByKeys(evidence, imageAttemptCountKeys, 0); ok {
		attemptCount = value
	}
	if retryIndex < 0 {
		retryIndex = 0
	}
	if attemptCount <= 0 {
		attemptCount = 1
	}
	if attemptCount <= retryIndex {
		attemptCount = retryIndex + 1
	}
	return retryIndex, attemptCount
}

func imageAttemptIntegerByKeys(value any, keys []string, depth int) (int, bool) {
	if value == nil || depth > 4 {
		return 0, false
	}
	item, ok := value.(map[string]any)
	if !ok {
		return 0, false
	}
	for _, key := range keys {
		if raw, exists := item[key]; exists {
			return util.ToInt(raw, 0), true
		}
	}
	for _, key := range imageAttemptContainerKeys {
		if found, exists := imageAttemptIntegerByKeys(item[key], keys, depth+1); exists {
			return found, true
		}
	}
	return 0, false
}

func reportImageProviderAttempt(ctx context.Context, provider, model, host string, retryIndex, attemptCount int, evidence map[string]any, err error) {
	metadata := service.ImageTaskUpstreamMetadataFromError(err)
	evidenceHost := util.Clean(evidence["upstream_host"])
	evidenceStatus := util.ToInt(evidence["upstream_http_status"], 0)
	evidenceRequestID := util.Clean(evidence["upstream_request_id"])
	evidenceCFRay := util.Clean(evidence["upstream_cf_ray"])
	extra := map[string]any{
		"effective_provider": provider,
		"effective_channel":  imageTaskProviderChannel(provider),
		"effective_model":    model,
		"upstream_host":      firstNonEmpty(metadata.UpstreamHost, evidenceHost, host),
		"retry_index":        retryIndex,
		"attempt_count":      attemptCount,
	}
	if metadata.HTTPStatus > 0 {
		extra["upstream_http_status"] = metadata.HTTPStatus
	} else if evidenceStatus > 0 {
		extra["upstream_http_status"] = evidenceStatus
	} else if err == nil {
		extra["upstream_http_status"] = http.StatusOK
	}
	if metadata.RequestID != "" {
		extra["upstream_request_id"] = metadata.RequestID
	} else if evidenceRequestID != "" {
		extra["upstream_request_id"] = evidenceRequestID
	}
	if metadata.CFRay != "" {
		extra["upstream_cf_ray"] = metadata.CFRay
	} else if evidenceCFRay != "" {
		extra["upstream_cf_ray"] = evidenceCFRay
	}
	stage := "upstream_attempt"
	message := "上游请求已完成"
	if err != nil {
		stage = "upstream_attempt_failed"
		message = "上游请求失败，准备按策略处理"
	}
	service.ReportTaskEvent(ctx, stage, message, extra)
}

func imageTaskProviderChannel(provider string) string {
	switch provider {
	case service.ImageTaskProviderAccountPool:
		return service.ImageTaskChannelAccountPool
	case service.ImageTaskProviderProxyAPI:
		return service.ImageTaskChannelProxyAPI
	case service.ImageTaskProviderGrokRuntime:
		return service.ImageTaskChannelGrokRuntime
	default:
		return ""
	}
}

func imageAttemptModel(body map[string]any, fallback string) string {
	return firstNonEmpty(util.Clean(body["effective_model"]), util.Clean(body["model"]), fallback)
}
