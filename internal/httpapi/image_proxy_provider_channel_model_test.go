package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/util"
)

func TestChannelModelOverridesStudioModelBeforeProxyRequest(t *testing.T) {
	var received string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		received = util.Clean(payload["model"])
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"url": "https://cdn.example/nano.png"}}})
	}))
	defer server.Close()

	app := &App{config: newTestConfigStore(t)}
	body := proxyChannelTaskPayload(server.URL, "draw a cat")
	body["model"] = "gpt-image-2.5-flare"
	body["effective_model"] = "nano-banana2"
	result, err := app.runImageGenerationTask(context.Background(), body)
	if err != nil {
		t.Fatalf("runImageGenerationTask() error = %v", err)
	}
	if received != "nano-banana2" {
		t.Fatalf("upstream model = %q, want channel effective model", received)
	}
	if items := util.AsMapSlice(result["data"]); len(items) != 1 {
		t.Fatalf("result data = %#v", result)
	}
}

func TestProxyRequestModelKeepsLegacyGlobalProxyBehavior(t *testing.T) {
	cfg := imageProxyConfig{Model: "configured-model"}
	if got := proxyRequestModel(map[string]any{"model": "requested-model"}, cfg); got != "requested-model" {
		t.Fatalf("legacy proxy model = %q", got)
	}
	if got := proxyRequestModel(map[string]any{"channel_model_id": "relay-1", "model": "requested-model"}, imageProxyConfig{Model: "upstream-model"}); got != "upstream-model" {
		t.Fatalf("channel model = %q", got)
	}
}
