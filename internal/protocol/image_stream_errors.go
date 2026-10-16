package protocol

import (
	"errors"
	"os"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

// imageAttemptTimeout is the per-account upstream stream wait before switching to another
// pool token. Images 2.5 can finish asynchronously after the stream closes, so the
// default matches the current Web image flow while result recovery uses
// the parent task context. Override with CHATGPT2API_IMAGE_ATTEMPT_TIMEOUT_SECONDS.
func imageAttemptTimeout() time.Duration {
	seconds := util.ToInt(os.Getenv("CHATGPT2API_IMAGE_ATTEMPT_TIMEOUT_SECONDS"), 80)
	if seconds < 30 {
		seconds = 30
	}
	if seconds > 1800 {
		seconds = 1800
	}
	return time.Duration(seconds) * time.Second
}

func imageStreamErrorMessage(message string) string {
	text := strings.TrimSpace(message)
	lower := strings.ToLower(text)
	if isCloudflareChallengeMessage(text) {
		return "upstream returned Cloudflare challenge page; refresh browser fingerprint/session or change proxy"
	}
	if detail, ok := util.SummarizeUpstreamConnectionError(text); ok {
		return detail
	}
	if strings.Contains(lower, "stream id 1") && strings.Contains(lower, "internal_error") && strings.Contains(lower, "received from peer") {
		return "upstream image stream was reset by peer; retry later or switch model / lower resolution"
	}
	if text == "" {
		return "image generation failed"
	}
	return text
}

func newImageStreamGenerationError(message string) *ImageGenerationError {
	metadata := service.ImageTaskUpstreamMetadataFromError(errors.New(message))
	return &ImageGenerationError{
		Message:            imageStreamErrorMessage(message),
		StatusCode:         502,
		Type:               "server_error",
		Code:               "upstream_error",
		UpstreamHost:       metadata.UpstreamHost,
		UpstreamHTTPStatus: metadata.HTTPStatus,
		UpstreamRequestID:  metadata.RequestID,
		UpstreamCFRay:      metadata.CFRay,
		RetryIndex:         metadata.RetryIndex,
		AttemptCount:       metadata.AttemptCount,
	}
}

func isRetryableImageStreamError(message string) bool {
	lower := strings.ToLower(strings.TrimSpace(message))
	if lower == "" {
		return true
	}
	if isCloudflareChallengeMessage(lower) {
		return true
	}
	if strings.Contains(lower, "deadline exceeded") || strings.Contains(lower, "timed out") || strings.Contains(lower, "timeout") {
		return true
	}
	retryableParts := []string{
		"stream error",
		"internal_error",
		"received from peer",
		"reset by peer",
		"connection reset",
		"unexpected eof",
		"eof",
		"connection aborted",
		"remote disconnected",
		"tls connect error",
		"flow_control_error",
		"upstream connection failed",
		"upstream image stream was reset",
		"http2",
	}
	for _, part := range retryableParts {
		if strings.Contains(lower, part) {
			return true
		}
	}
	return false
}
