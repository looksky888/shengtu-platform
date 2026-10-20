package protocol

import (
	"errors"
	"net/http"
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

// imageStreamErrorHead returns the transport part of an upstream error message
// and drops the upstream response body. backend.upstreamHTTPError* appends up
// to 2 KiB of that body after its " failed: status=<code>, " envelope, so body
// wording must never decide retryability.
func imageStreamErrorHead(lower string) string {
	const envelope = " failed: status="
	index := strings.Index(lower, envelope)
	if index < 0 {
		return lower
	}
	rest := lower[index+len(envelope):]
	if end := strings.IndexAny(rest, ", ("); end >= 0 {
		return lower[:index+len(envelope)+end]
	}
	return lower
}

// imageStreamRetryableParts are transport/stream-level signatures that the
// HTTP/SSE stack and our own normalisation emit. They are matched inside
// imageStreamErrorHead only. The former bare "eof"/"stream"/"connection"
// matches were removed: they fired on ordinary words inside upstream bodies.
var imageStreamRetryableParts = []string{
	"deadline exceeded",
	"timed out",
	"timeout",
	"stream error",
	"stream closed",
	"reset by peer",
	"connection reset",
	"connection refused",
	"connection aborted",
	"remote disconnected",
	"unexpected eof",
	"no such host",
	"tls connect error",
	"tls handshake",
	"flow_control_error",
	"upstream connection failed",
	"internal_error",
	"received from peer",
	"http2",
}

// isRetryableImageStreamError classifies an upstream image-stream failure. The
// status code is read from our own error envelope (the project's existing
// ImageTaskUpstreamMetadataFromError parser); the wording-based signatures are
// only consulted in the part of the message our own code produced.
func isRetryableImageStreamError(message string) bool {
	lower := strings.ToLower(strings.TrimSpace(message))
	if lower == "" {
		return true
	}
	if isCloudflareChallengeMessage(lower) {
		return true
	}
	if status := service.ImageTaskUpstreamMetadataFromError(errors.New(lower)).HTTPStatus; status == http.StatusTooManyRequests || status >= 500 {
		return true
	}
	head := imageStreamErrorHead(lower)
	for _, part := range imageStreamRetryableParts {
		if strings.Contains(head, part) {
			return true
		}
	}
	return false
}
