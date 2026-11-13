package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestCustomRelayChannelProtocolGenerationsCountInTodayStats(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"created": 1730000000,
			"data": []map[string]any{
				{"url": "https://cdn.relay.example/out-1.png"},
				{"url": "https://cdn.relay.example/out-2.png"},
			},
		})
	}))
	defer upstream.Close()

	app := newTestApp(t)
	defer app.Close()

	channelRec, err := app.imageChannels.CreateChannel(service.ImageChannelInput{
		Name:           "Custom Relay",
		Type:           service.ImageChannelTypeOpenAICompatible,
		BaseURL:        upstream.URL,
		APIKey:         "sk-relay-test",
		TimeoutSeconds: 30,
		MaxConcurrency: 4,
		DownloadURLs:   false,
		Enabled:        true,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	modelRec, err := app.imageChannels.CreateModel(channelRec.ID, service.ImageChannelModelInput{
		DisplayName:   "Relay Flux Pro",
		UpstreamModel: "relay-flux-pro",
		CreditCost:    1,
		Capabilities:  []string{service.ImageCapabilityGenerate},
		Enabled:       true,
	})
	if err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "relay-stats-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if _, _, err := app.credits.Add(user.ID, 100, "test", "seed"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	reqBody, _ := json.Marshal(map[string]any{
		"model":            "relay-flux-pro",
		"channel_model_id": modelRec.ID,
		"prompt":           "a sunset over mountains",
		"n":                2,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/v1/images/generations status = %d body = %s, want 200", res.Code, res.Body.String())
	}

	stats := app.tasks.TodayStats(util.NowChina())
	if stats.SuccessTasks != 1 || stats.SuccessImages != 2 || stats.FailedTasks != 0 {
		t.Fatalf("TodayStats after relay generation = %+v, want success_tasks=1 success_images=2 failed_tasks=0", stats)
	}

	// Verify /api/image-task-stats/today HTTP endpoint returns the updated tally.
	statsReq := httptest.NewRequest(http.MethodGet, "/api/image-task-stats/today", nil)
	statsReq.Header.Set("Authorization", "Bearer "+rawKey)
	statsRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(statsRes, statsReq)
	if statsRes.Code != http.StatusOK {
		t.Fatalf("/api/image-task-stats/today status = %d body = %s, want 200", statsRes.Code, statsRes.Body.String())
	}
	var payload struct {
		Stats service.ImageTaskDailyStats `json:"stats"`
	}
	if err := json.Unmarshal(statsRes.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal today stats error = %v", err)
	}
	if payload.Stats.SuccessImages != 2 || payload.Stats.SuccessTasks != 1 {
		t.Fatalf("GET /api/image-task-stats/today = %+v, want success_images=2 success_tasks=1", payload.Stats)
	}
}

func TestWriteProtocolWithImageStatsExcludesTextChatAndCountsImageFailures(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity := service.Identity{ID: "u-stats-1", Role: service.AuthRoleUser, Name: "u-stats-1"}

	// 1. Plain text chat must NOT be counted as an image generation.
	textReq := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	textRes := httptest.NewRecorder()
	app.writeProtocolWithImageStats(
		textRes, textReq,
		map[string]any{"id": "chatcmpl-text", "choices": []map[string]any{{"message": map[string]any{"content": "hello"}}}},
		nil, nil, "openai", "/v1/chat/completions", "gpt-5", identity, "文本生成", service.ImageVisibilityPrivate, nil,
		protocolImageStatsSpec{Enabled: false},
	)
	if textRes.Code != http.StatusOK {
		t.Fatalf("text chat status = %d", textRes.Code)
	}
	stats := app.tasks.TodayStats(util.NowChina())
	if stats.SuccessTasks != 0 || stats.FailedTasks != 0 || stats.SuccessImages != 0 {
		t.Fatalf("text chat unexpectedly changed stats: %+v", stats)
	}

	// 2. Upstream image failure must increment failed tasks and failed images.
	failReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	failRes := httptest.NewRecorder()
	app.writeProtocolWithImageStats(
		failRes, failReq,
		nil, nil, errors.New("upstream relay error"), "openai", "/v1/images/generations", "relay-flux",
		identity, "文生图", service.ImageVisibilityPrivate, nil,
		protocolImageStatsSpec{Enabled: true, Mode: "generate", RequestedCount: 2},
	)
	stats = app.tasks.TodayStats(util.NowChina())
	if stats.FailedTasks != 1 || stats.FailedImages != 2 {
		t.Fatalf("stats after relay error = %+v, want failed_tasks=1 failed_images=2", stats)
	}

	// 3. Canceled context must NOT be counted as a failed image task.
	cancelReq := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	cancelRes := httptest.NewRecorder()
	app.writeProtocolWithImageStats(
		cancelRes, cancelReq,
		nil, nil, context.Canceled, "openai", "/v1/images/generations", "relay-flux",
		identity, "文生图", service.ImageVisibilityPrivate, nil,
		protocolImageStatsSpec{Enabled: true, Mode: "generate", RequestedCount: 1},
	)
	stats = app.tasks.TodayStats(util.NowChina())
	if stats.FailedTasks != 1 || stats.FailedImages != 2 {
		t.Fatalf("canceled request mutated stats = %+v, want failed_tasks=1 failed_images=2", stats)
	}
}
