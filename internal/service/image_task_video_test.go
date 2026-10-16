package service

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestSubmitVideoAcceptsReferenceDurationRange(t *testing.T) {
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		return map[string]any{"output_type": "video", "data": []map[string]any{{"url": "/video.mp4"}}}, nil
	}
	service := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 3 })
	service.SetVideoHandler(handler)
	service.BindRootContext(context.Background())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Close(ctx)
	})
	identity := Identity{ID: "video-user", OwnerID: "video-user"}
	if _, err := service.SubmitVideo(context.Background(), identity, "video-15", "test", "grok-imagine-video", "720x1280", 15, "720p", "custom", nil, nil); err != nil {
		t.Fatalf("SubmitVideo(15) error = %v", err)
	}
	if _, err := service.SubmitVideo(context.Background(), identity, "video-16", "test", "grok-imagine-video", "720x1280", 16, "720p", "custom", nil, nil); err == nil || !strings.Contains(err.Error(), "1 到 15 秒") {
		t.Fatalf("SubmitVideo(16) error = %v", err)
	}
}

func TestVideoTaskTimeoutHasIndependentMinimum(t *testing.T) {
	service := &ImageTaskService{taskTimeoutGetter: func() time.Duration { return time.Minute }}
	if got := service.taskTimeoutForMode("video"); got != 5*time.Minute {
		t.Fatalf("video timeout = %s, want 5m", got)
	}
	if got := service.taskTimeoutForMode("generate"); got != time.Minute {
		t.Fatalf("image timeout = %s, want 1m", got)
	}
}

func TestSubmitVideoPersistsSeparatedImageInputs(t *testing.T) {
	payloads := make(chan map[string]any, 1)
	handler := func(_ context.Context, _ Identity, payload map[string]any) (map[string]any, error) {
		payloads <- payload
		return map[string]any{"output_type": "video", "data": []map[string]any{{"url": "/video.mp4"}}}, nil
	}
	service := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 1 })
	service.SetVideoHandler(handler)
	service.BindRootContext(context.Background())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Close(ctx)
	})
	identity := Identity{ID: "video-user", OwnerID: "video-user"}
	refs := []any{"video-input:one", "video-input:two"}
	if _, err := service.SubmitVideo(context.Background(), identity, "video-inputs", "test", "grok-imagine-video-1.5", "1280x720", 6, "720p", "custom", "video-input:first", refs); err != nil {
		t.Fatalf("SubmitVideo() error = %v", err)
	}
	select {
	case payload := <-payloads:
		if payload["image_reference"] != "video-input:first" || len(payload["reference_images"].([]any)) != 2 {
			t.Fatalf("video payload = %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("video handler was not called")
	}
}
