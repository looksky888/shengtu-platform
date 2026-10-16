package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestFetchProxyModelsUsesOpenAICompatibleModelsEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected model path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{
				{"id": "gpt-image-2"},
				{"id": "gpt-image-2"},
				{"id": "gpt-image-1"},
			},
		})
	}))
	defer server.Close()

	models, err := fetchProxyModels(context.Background(), server.Client(), server.URL, "test-key", 5)
	if err != nil {
		t.Fatalf("fetchProxyModels returned error: %v", err)
	}
	want := []string{"gpt-image-2", "gpt-image-1"}
	if len(models) != len(want) {
		t.Fatalf("models length = %d, want %d: %#v", len(models), len(want), models)
	}
	for index := range want {
		if models[index] != want[index] {
			t.Fatalf("models[%d] = %q, want %q", index, models[index], want[index])
		}
	}
}

func TestCallProxyImageGenerationsDefaultsToURLResponseFormat(t *testing.T) {
	t.Parallel()

	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected generation path: %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("decode request payload: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"url": "https://cdn.example/image.png"}}})
	}))
	defer server.Close()

	_, err := callProxyImageGenerations(context.Background(), server.Client(), imageProxyConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-image-2"}, map[string]any{"prompt": "draw"})
	if err != nil {
		t.Fatalf("callProxyImageGenerations() error = %v", err)
	}
	if payload["response_format"] != "url" {
		t.Fatalf("response_format = %#v, want url", payload["response_format"])
	}
}

func TestCallProxyImageGenerationsInvalidJSONIncludesResponsePreview(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusGatewayTimeout)
		_, _ = w.Write([]byte("<html><title>Gateway Timeout</title><body>upstream timeout</body></html>"))
	}))
	defer server.Close()

	_, err := callProxyImageGenerations(context.Background(), server.Client(), imageProxyConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-image-2"}, map[string]any{"prompt": "draw"})
	if err == nil {
		t.Fatal("callProxyImageGenerations() error = nil")
	}
	message := err.Error()
	for _, want := range []string{"中转站返回非 JSON", "504 Gateway Timeout", "text/html", "Gateway Timeout"} {
		if !strings.Contains(message, want) {
			t.Fatalf("error %q missing %q", message, want)
		}
	}
}

func TestCallProxyImageGenerationsCloudflare524IsRetryableTimeout(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
		w.WriteHeader(524)
		_, _ = w.Write([]byte("error code: 524"))
	}))
	defer server.Close()

	_, err := callProxyImageGenerations(context.Background(), server.Client(), imageProxyConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-image-2"}, map[string]any{"prompt": "draw"})
	if err == nil {
		t.Fatal("callProxyImageGenerations() error = nil")
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.StatusCode != 524 {
		t.Fatalf("status = %d, want 524", imageErr.StatusCode)
	}
	if !strings.Contains(imageErr.Code, "http_524") {
		t.Fatalf("code = %q, want http_524 marker", imageErr.Code)
	}
	if !isRetryableProxyError(err) {
		t.Fatalf("524 proxy error should be retryable: %v", err)
	}
	if got := proxyRetryLimit(1, err); got != 2 {
		t.Fatalf("proxyRetryLimit() = %d, want 2", got)
	}
}

func TestCallProxyImageGenerationsPlainText502IsRetryableGatewayError(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("error code: 502"))
	}))
	defer server.Close()

	_, err := callProxyImageGenerations(context.Background(), server.Client(), imageProxyConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-image-2"}, map[string]any{"prompt": "draw"})
	if err == nil {
		t.Fatal("callProxyImageGenerations() error = nil")
	}
	var imageErr *protocol.ImageGenerationError
	if !errors.As(err, &imageErr) {
		t.Fatalf("error type = %T, want ImageGenerationError", err)
	}
	if imageErr.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", imageErr.StatusCode)
	}
	if !strings.Contains(imageErr.Code, "http_502") {
		t.Fatalf("code = %q, want http_502 marker", imageErr.Code)
	}
	if !isRetryableProxyError(err) {
		t.Fatalf("502 proxy error should be retryable: %v", err)
	}
	if got := proxyRetryLimit(1, err); got != 2 {
		t.Fatalf("proxyRetryLimit() = %d, want 2", got)
	}
}

func TestProxyRateLimitErrorIsRetryable(t *testing.T) {
	t.Parallel()

	err := proxyImageError(http.StatusTooManyRequests, map[string]any{
		"error": map[string]any{"message": "Upstream rate limit exceeded, please retry later"},
	})
	if !isRetryableProxyError(err) {
		t.Fatalf("429 proxy error should be retryable: %v", err)
	}
	if got := proxyRetryLimit(1, err); got != 3 {
		t.Fatalf("proxyRetryLimit() = %d, want 3", got)
	}
}

func TestProxyImageResultItemsReadsNestedCompatiblePayloads(t *testing.T) {
	t.Parallel()

	items := proxyImageResultItems(map[string]any{
		"result": map[string]any{
			"images": []any{
				map[string]any{"image_url": "https://cdn.example/a.png"},
				map[string]any{"base64": base64.StdEncoding.EncodeToString([]byte("this is a fake but long enough image payload fixture"))},
			},
		},
	})
	if len(items) != 2 {
		t.Fatalf("items length = %d, want 2: %#v", len(items), items)
	}
	if items[0]["url"] != "https://cdn.example/a.png" {
		t.Fatalf("first item url = %#v", items[0])
	}
	if util.Clean(items[1]["b64_json"]) == "" {
		t.Fatalf("second item missing b64_json: %#v", items[1])
	}
}

func TestResolveProxyImagePayloadPollsTaskID(t *testing.T) {
	t.Parallel()

	polls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/images/generations/task-1":
			polls++
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "result": map[string]any{"output_url": "https://cdn.example/done.png"}})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	app := &App{}
	payload, err := app.resolveProxyImagePayload(context.Background(), imageProxyConfig{BaseURL: server.URL, APIKey: "test-key"}, map[string]any{"task_id": "task-1", "status": "running"}, "/images/generations")
	if err != nil {
		t.Fatalf("resolveProxyImagePayload() error = %v", err)
	}
	if polls != 1 {
		t.Fatalf("polls = %d, want 1", polls)
	}
	items := proxyImageResultItems(payload)
	if len(items) != 1 || items[0]["url"] != "https://cdn.example/done.png" {
		t.Fatalf("items = %#v, want completed output_url", items)
	}
}

func TestResponsesImageTaskUsesProxyProvider(t *testing.T) {
	var called bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		called = true
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request payload: %v", err)
		}
		if payload["model"] != "gpt-image-2" || payload["prompt"] != "draw a cat" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"url": "https://cdn.example/cat.png"}}})
	}))
	defer server.Close()

	cfg := newTestConfigStore(t)
	app := &App{config: cfg}
	result, err := app.runResponsesImageGenerationTask(context.Background(), proxyChannelTaskPayload(server.URL, "draw a cat"))
	if err != nil {
		t.Fatalf("runResponsesImageGenerationTask() error = %v", err)
	}
	if !called {
		t.Fatal("proxy image endpoint was not called")
	}
	data := util.AsMapSlice(result["data"])
	if len(data) != 1 || data[0]["url"] != "https://cdn.example/cat.png" {
		t.Fatalf("result data = %#v", data)
	}
}

func TestImageGenerationTaskUsesProxyProvider(t *testing.T) {
	var called bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		called = true
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request payload: %v", err)
		}
		if payload["model"] != "gpt-image-2" || payload["prompt"] != "draw a dog" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"url": "https://cdn.example/dog.png"}}})
	}))
	defer server.Close()

	cfg := newTestConfigStore(t)
	app := &App{config: cfg}
	result, err := app.runImageGenerationTask(context.Background(), proxyChannelTaskPayload(server.URL, "draw a dog"))
	if err != nil {
		t.Fatalf("runImageGenerationTask() error = %v", err)
	}
	if !called {
		t.Fatal("proxy image endpoint was not called")
	}
	data := util.AsMapSlice(result["data"])
	if len(data) != 1 || data[0]["url"] != "https://cdn.example/dog.png" {
		t.Fatalf("result data = %#v", data)
	}
}

func proxyChannelTaskPayload(baseURL, prompt string) map[string]any {
	return map[string]any{
		"channel_model_id":        "relay-model-test",
		"effective_provider":      service.ImageTaskProviderProxyAPI,
		"effective_channel":       "image_channel:relay-test",
		"effective_model":         "gpt-image-2",
		"channel_base_url":        baseURL,
		"channel_api_key":         "test-key",
		"channel_timeout_seconds": 30,
		"channel_max_retries":     0,
		"channel_download_urls":   false,
		"model":                   "gpt-image-2",
		"prompt":                  prompt,
		"n":                       1,
	}
}

func TestProxyHealthRecordsSuccessAndCloudflare524(t *testing.T) {
	t.Parallel()

	app := &App{proxyStats: newImageProxyHealth()}
	app.recordProxyImageHealth(time.Now().Add(-150*time.Millisecond), imageProxyConfig{Model: "gpt-image-2"}, "/images/generations", nil)
	app.recordProxyImageHealth(time.Now().Add(-50*time.Millisecond), imageProxyConfig{Model: "gpt-image-2"}, "/images/generations", &protocol.ImageGenerationError{
		Message:    "error code: 524",
		StatusCode: 524,
		Type:       "server_error",
		Code:       "image_proxy_http_524_invalid_json",
	})

	health := app.imageProxyHealthSnapshot()
	if health.Total != 2 || health.Success != 1 || health.Failed != 1 {
		t.Fatalf("unexpected health summary: %#v", health)
	}
	if health.Timeout != 1 || health.GatewayErrors != 1 {
		t.Fatalf("unexpected timeout/gateway counters: %#v", health)
	}
	if health.LastStatus != "failed" || health.LastErrorCode != "image_proxy_http_524_invalid_json" {
		t.Fatalf("unexpected last status/error: %#v", health)
	}
	if len(health.Models) != 1 {
		t.Fatalf("models length = %d, want 1: %#v", len(health.Models), health.Models)
	}
	if health.Models[0].Model != "gpt-image-2" || health.Models[0].Total != 2 || health.Models[0].SuccessRate != 50 {
		t.Fatalf("unexpected model health: %#v", health.Models[0])
	}
}

func TestProxyHealthPersistsRecentEvents(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "image_proxy_health.json")
	health := newImageProxyHealth(path)
	health.Record(imageProxyHealthEvent{
		At:         time.Now(),
		Success:    true,
		Model:      "gpt-image-2",
		Path:       "/images/generations",
		DurationMS: 120,
		StatusCode: http.StatusOK,
	})

	reloaded := newImageProxyHealth(path)
	snapshot := reloaded.Snapshot()
	if snapshot.Total != 1 || snapshot.Success != 1 {
		t.Fatalf("unexpected persisted health snapshot: %#v", snapshot)
	}
	if len(snapshot.Models) != 1 || snapshot.Models[0].Model != "gpt-image-2" {
		t.Fatalf("unexpected persisted model stats: %#v", snapshot.Models)
	}
}

func TestDownloadProxyImageURLSavesRemoteImage(t *testing.T) {
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/azX+p8AAAAASUVORK5CYII=")
	if err != nil {
		t.Fatalf("decode image fixture: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(imageBytes)
	}))
	defer server.Close()

	t.Setenv("CHATGPT2API_BASE_URL", "https://site.example")
	cfg := newTestConfigStore(t)
	app := &App{config: cfg, engine: &protocol.Engine{Config: cfg}}
	// proxyBase must match media host so SSRF allowlist accepts local httptest.
	localURL, outputFormat, err := app.downloadProxyImageURL(context.Background(), server.URL+"/image.png", map[string]any{
		"base_url":   "https://site.example",
		"owner_id":   "user-1",
		"owner_name": "Alice",
	}, 30, "", server.URL)
	if err != nil {
		t.Fatalf("downloadProxyImageURL() error = %v", err)
	}
	if outputFormat != "png" {
		t.Fatalf("outputFormat = %q, want png", outputFormat)
	}
	if !strings.HasPrefix(localURL, "https://site.example/images/") {
		t.Fatalf("localURL = %q, want local image URL", localURL)
	}
	parsed, err := url.Parse(localURL)
	if err != nil {
		t.Fatalf("parse local URL: %v", err)
	}
	rel := strings.TrimPrefix(parsed.Path, "/images/")
	if rel == parsed.Path || rel == "" {
		t.Fatalf("localURL path = %q, want /images/<rel>", parsed.Path)
	}
	if _, err := os.Stat(filepath.Join(cfg.ImagesDir(), filepath.FromSlash(rel))); err != nil {
		t.Fatalf("saved image not found: %v", err)
	}
}
