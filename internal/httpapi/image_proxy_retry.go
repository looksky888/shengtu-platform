package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
)

func retryProxyRequest(ctx context.Context, maxRetries int, run func() error) error {
	var err error
	for attempt := 0; ; attempt++ {
		if err = run(); err == nil {
			return nil
		}
		if !isRetryableProxyError(err) || attempt >= proxyRetryLimit(maxRetries, err) {
			return err
		}
		timer := time.NewTimer(proxyRetryDelay(attempt, err))
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func isRetryableProxyError(err error) bool {
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		return true
	}
	return imageErr.StatusCode >= 500 ||
		imageErr.StatusCode == http.StatusTooManyRequests ||
		strings.Contains(imageErr.Code, "transport") ||
		strings.Contains(imageErr.Code, "http_429") ||
		strings.Contains(imageErr.Code, "http_5")
}

func proxyRetryLimit(maxRetries int, err error) int {
	if maxRetries < 0 {
		maxRetries = 0
	}
	if isProxyRateLimitError(err) && maxRetries < 3 {
		return 3
	}
	if isProxyTransientGatewayError(err) && maxRetries < 2 {
		return 2
	}
	return maxRetries
}

func proxyRetryDelay(attempt int, err error) time.Duration {
	if isProxyRateLimitError(err) {
		switch attempt {
		case 0:
			return 8 * time.Second
		case 1:
			return 16 * time.Second
		default:
			return 32 * time.Second
		}
	}
	return time.Duration(attempt+1) * time.Second
}

func isProxyRateLimitError(err error) bool {
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) && (imageErr.StatusCode == http.StatusTooManyRequests || strings.Contains(imageErr.Code, "http_429")) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "rate limit") || strings.Contains(lower, "too many requests") || strings.Contains(lower, "速率")
}

func isProxyGatewayTimeoutError(err error) bool {
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) && (imageErr.StatusCode == http.StatusGatewayTimeout || imageErr.StatusCode == 524 || strings.Contains(imageErr.Code, "http_524")) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "gateway timeout") || strings.Contains(lower, "error code: 524") || strings.Contains(lower, "status=524")
}

func isProxyTransientGatewayError(err error) bool {
	var imageErr *protocol.ImageGenerationError
	if errors.As(err, &imageErr) && imageErr.StatusCode >= http.StatusBadGateway {
		return true
	}
	if isProxyGatewayTimeoutError(err) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "bad gateway") ||
		strings.Contains(lower, "status=502") ||
		strings.Contains(lower, "status=503") ||
		strings.Contains(lower, "status=504") ||
		strings.Contains(lower, "error code: 502") ||
		strings.Contains(lower, "error code: 503") ||
		strings.Contains(lower, "error code: 504")
}

func clampPositive(value, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}
