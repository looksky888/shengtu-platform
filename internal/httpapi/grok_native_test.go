package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestRunGrokNativeImageGenerationDownloadsAndStoresAuthenticatedAsset(t *testing.T) {
	const imageData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/images/generations" {
			t.Fatalf("request path = %q", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if body["response_format"] != "b64_json" {
			t.Fatalf("sidecar response_format = %#v, want b64_json", body["response_format"])
		}
		if stream, ok := body["stream"].(bool); !ok || stream {
			t.Fatalf("sidecar stream = %#v, want false", body["stream"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1700000000,"attempt_count":2,"retry_index":1,"data":[{"b64_json":"` + imageData + `"}]}`))
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	sink := &imageAttemptCaptureSink{}
	ctx := service.WithTaskProgress(context.Background(), sink)
	result, err := app.runGrokNativeImageGeneration(ctx, map[string]any{
		"model": "grok-imagine-image", "prompt": "draw", "response_format": "url",
		"stream":   true,
		"base_url": "https://site.example.test", "owner_id": "user-1", "owner_name": "Alice",
	}, nil)
	if err != nil {
		t.Fatalf("runGrokNativeImageGeneration() error = %v", err)
	}
	items := result["data"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("result data = %#v", result)
	}
	imageURL := strings.TrimSpace(items[0]["url"].(string))
	if !strings.HasPrefix(imageURL, "https://site.example.test/images/") {
		t.Fatalf("image url = %q", imageURL)
	}
	if util.ToInt(result["retry_index"], -1) != 1 || util.ToInt(result["attempt_count"], 0) != 2 {
		t.Fatalf("result attempt metadata = %#v", result)
	}
	if sink.stage != "upstream_attempt" || util.ToInt(sink.extra["retry_index"], -1) != 1 || util.ToInt(sink.extra["attempt_count"], 0) != 2 {
		t.Fatalf("attempt event = stage %q extra %#v", sink.stage, sink.extra)
	}
	parsed, err := url.Parse(imageURL)
	if err != nil {
		t.Fatalf("parse image url: %v", err)
	}
	rel := strings.TrimPrefix(parsed.Path, "/images/")
	if info, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))); err != nil || info.Size() == 0 {
		t.Fatalf("stored image stat = %#v, err = %v", info, err)
	}
}

func TestRunGrokNativeImageGenerationRoutesImageEditAsNonStreamingJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/images/edits" {
			t.Fatalf("request path = %q", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if stream, ok := body["stream"].(bool); !ok || stream {
			t.Fatalf("sidecar stream = %#v, want false", body["stream"])
		}
		images := body["images"].([]any)
		image := images[0].(map[string]any)
		if image["b64_json"] != "aGVsbG8=" || image["mime"] != "image/png" || image["filename"] != "source.png" {
			t.Fatalf("sidecar images = %#v", images)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1700000000,"data":[{"url":"https://assets.example.test/edited.png"}]}`))
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	result, err := app.runGrokNativeImageGeneration(
		context.Background(),
		map[string]any{"model": "grok-imagine-image-edit", "prompt": "make it blue", "stream": true},
		[]protocol.UploadedImage{{Data: []byte("hello"), ContentType: "image/png", Filename: "source.png"}},
	)
	if err != nil {
		t.Fatalf("runGrokNativeImageGeneration() error = %v", err)
	}
	items := util.AsMapSlice(result["data"])
	if len(items) != 1 || items[0]["url"] != "https://assets.example.test/edited.png" {
		t.Fatalf("result data = %#v", result)
	}
}

func TestRunGrokNativeChatCompletionPreservesClientErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/chat/completions" {
			t.Fatalf("request path = %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"detail":{"error":{"message":"No active xAI CLI OAuth account exposes grok-4.5","type":"rate_limit_exceeded","code":"rate_limit_exceeded"}}}`))
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	_, err := app.runGrokNativeChatCompletion(context.Background(), map[string]any{"model": "grok-4.5"})
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", imageErr.StatusCode)
	}
	if imageErr.Message != "No active xAI CLI OAuth account exposes grok-4.5" || imageErr.Type != "rate_limit_exceeded" || imageErr.Code != "rate_limit_exceeded" {
		t.Fatalf("error contract = %#v", imageErr)
	}
}

func TestRunGrokNativeChatCompletionMapsSidecarServerErrorsToBadGateway(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"message":"account directory unavailable","type":"upstream_error","code":"account_directory_unavailable"}}`))
	}))
	defer server.Close()

	t.Setenv("GROK_RUNTIME_BASE_URL", server.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", strings.Repeat("g", 32))
	app := newTestApp(t)
	_, err := app.runGrokNativeChatCompletion(context.Background(), map[string]any{"model": "grok-4.20-fast"})
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.StatusCode != http.StatusBadGateway || imageErr.UpstreamHTTPStatus != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, upstream = %d", imageErr.StatusCode, imageErr.UpstreamHTTPStatus)
	}
	if imageErr.Message != "account directory unavailable" || imageErr.Type != "upstream_error" || imageErr.Code != "account_directory_unavailable" {
		t.Fatalf("error contract = %#v", imageErr)
	}
}
