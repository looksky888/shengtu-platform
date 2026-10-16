package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type imageAttemptCaptureSink struct {
	stage string
	extra map[string]any
}

func (s *imageAttemptCaptureSink) Event(stage, _ string, extra map[string]any) {
	s.stage = stage
	s.extra = extra
}

func (*imageAttemptCaptureSink) BindAccount(string, string, int) {}
func (*imageAttemptCaptureSink) SetProgress(int, string, string) {}

func TestProxyImageErrorCapturesResponseEvidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-ID", "req-proxy-1")
		w.Header().Set("CF-Ray", "ray-proxy-1")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "upstream failed"}})
	}))
	defer server.Close()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, server.URL, nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	_, err = doProxyImageRequest(server.Client(), req)
	if err == nil {
		t.Fatal("doProxyImageRequest() error = nil")
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.UpstreamHTTPStatus != http.StatusBadGateway || imageErr.UpstreamRequestID != "req-proxy-1" || imageErr.UpstreamCFRay != "ray-proxy-1" {
		t.Fatalf("proxy evidence = %#v", imageErr)
	}
	if imageErr.UpstreamHost != routeHost(server.URL) {
		t.Fatalf("upstream host = %q, want %q", imageErr.UpstreamHost, routeHost(server.URL))
	}
}

func TestGrokImageErrorCapturesResponseEvidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/images/generations" {
			t.Fatalf("request path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Request-ID", "req-grok-1")
		w.Header().Set("CF-Ray", "ray-grok-1")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"detail": map[string]any{
				"error": map[string]any{
					"message":          "grok unavailable",
					"failure_category": "empty_media",
					"retry_index":      2,
					"attempt_count":    3,
				},
			},
		})
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	app := &App{config: newTestConfigStore(t)}
	sink := &imageAttemptCaptureSink{}
	ctx := service.WithTaskProgress(context.Background(), sink)
	_, err := app.runGrokNativeImageGeneration(ctx, map[string]any{
		"model":  util.ImageModelGrokImagine,
		"prompt": "draw",
	}, nil)
	if err == nil {
		t.Fatal("runGrokNativeImageGeneration() error = nil")
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.UpstreamHTTPStatus != http.StatusServiceUnavailable || imageErr.UpstreamRequestID != "req-grok-1" || imageErr.UpstreamCFRay != "ray-grok-1" {
		t.Fatalf("grok evidence = %#v", imageErr)
	}
	if imageErr.UpstreamHost != routeHost(server.URL) {
		t.Fatalf("upstream host = %q, want %q", imageErr.UpstreamHost, routeHost(server.URL))
	}
	if imageErr.RetryIndex != 2 || imageErr.AttemptCount != 3 {
		t.Fatalf("grok attempts = retry %d attempt %d", imageErr.RetryIndex, imageErr.AttemptCount)
	}
	if sink.stage != "upstream_attempt_failed" || util.ToInt(sink.extra["retry_index"], -1) != 2 || util.ToInt(sink.extra["attempt_count"], 0) != 3 {
		t.Fatalf("attempt event = stage %q extra %#v", sink.stage, sink.extra)
	}
}
