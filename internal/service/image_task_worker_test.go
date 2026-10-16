package service

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestImageTaskWorkerPoolBoundsHandlerConcurrency(t *testing.T) {
	var mu sync.Mutex
	active := 0
	maxActive := 0
	release := make(chan struct{})
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		mu.Unlock()
		<-release
		mu.Lock()
		active--
		mu.Unlock()
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 30 }, func() int { return 100 })
	svc.SetWorkerPoolConfig(2, 16)
	identity := Identity{ID: "worker-user"}
	for i := 0; i < 8; i++ {
		if _, err := svc.SubmitGeneration(context.Background(), identity, "worker-"+string(rune('a'+i)), "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
	}
	time.Sleep(50 * time.Millisecond)
	mu.Lock()
	gotMax := maxActive
	mu.Unlock()
	if gotMax != 2 {
		t.Fatalf("max handler concurrency = %d, want 2", gotMax)
	}
	close(release)
	for i := 0; i < 8; i++ {
		waitForTaskStatus(t, svc, identity, "worker-"+string(rune('a'+i)), TaskStatusSuccess)
	}
}

func TestImageTaskWorkerQueueRejectsOverflowWithoutLeavingTask(t *testing.T) {
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		started <- struct{}{}
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 30 }, func() int { return 100 })
	svc.SetWorkerPoolConfig(1, 1)
	identity := Identity{ID: "queue-user"}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "running", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("worker did not start")
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "queued", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "overflow", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err == nil || !strings.Contains(err.Error(), "队列已满") {
		t.Fatalf("overflow error = %v", err)
	}
	if got := svc.ListTasks(identity, []string{"overflow"}); len(got["items"].([]map[string]any)) != 0 {
		t.Fatalf("overflow task leaked into list: %#v", got)
	}
	close(release)
	waitForTaskStatus(t, svc, identity, "running", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "queued", TaskStatusSuccess)
}

func TestImageAndVideoWorkersAreIsolated(t *testing.T) {
	imageStarted := make(chan struct{}, 1)
	videoRelease := make(chan struct{})
	imageHandler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		imageStarted <- struct{}{}
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	videoHandler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		<-videoRelease
		return map[string]any{"output_type": "video", "data": []map[string]any{{"url": "/video.mp4"}}}, nil
	}
	svc := NewImageTaskService(t.TempDir()+"/tasks.json", imageHandler, imageHandler, imageHandler, func() int { return 30 }, func() int { return 30 })
	svc.SetVideoHandler(videoHandler)
	svc.SetWorkerPoolConfig(1, 1)
	svc.SetVideoWorkerPoolConfig(1, 1)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = svc.Close(ctx)
	})
	identity := Identity{ID: "isolated-user"}
	if _, err := svc.SubmitVideo(context.Background(), identity, "video-blocked", "draw", "grok-imagine-video", "720x1280", 6, "720p", "custom", nil, nil); err != nil {
		t.Fatal(err)
	}
	select {
	case <-imageStarted:
		t.Fatal("image worker started without an image task")
	case <-time.After(30 * time.Millisecond):
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "image-independent", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatalf("image task should use its own worker: %v", err)
	}
	select {
	case <-imageStarted:
	case <-time.After(time.Second):
		t.Fatal("image worker was blocked by video task")
	}
	close(videoRelease)
	waitForTaskStatus(t, svc, identity, "video-blocked", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "image-independent", TaskStatusSuccess)
}

func TestImageAndRelayWorkersAreIsolated(t *testing.T) {
	localStarted := make(chan struct{}, 1)
	relayStarted := make(chan struct{}, 1)
	localRelease := make(chan struct{})
	var releaseOnce sync.Once
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		if payload["effective_provider"] == ImageTaskProviderProxyAPI {
			relayStarted <- struct{}{}
		} else {
			localStarted <- struct{}{}
			<-localRelease
		}
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 30 }, func() int { return 30 })
	svc.SetWorkerPoolConfig(1, 1)
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(localRelease) })
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = svc.Close(ctx)
	})
	identity := Identity{ID: "relay-worker-user", Role: AuthRoleAdmin}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "local", "local", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatal(err)
	}
	select {
	case <-localStarted:
	case <-time.After(time.Second):
		t.Fatal("local image worker did not start")
	}
	if _, err := svc.SubmitGenerationWithMetadata(context.Background(), identity, "relay", "relay", "gpt-image-relay", "1024x1024", "high", "", 1, nil, map[string]any{
		"effective_provider": ImageTaskProviderProxyAPI,
		"effective_channel":  "image_channel:relay-1",
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-relayStarted:
	case <-time.After(time.Second):
		t.Fatal("relay image worker was blocked by local account-pool work")
	}
	releaseOnce.Do(func() { close(localRelease) })
	waitForTaskStatus(t, svc, identity, "local", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "relay", TaskStatusSuccess)
}

func TestImageTaskPersistsStageDurations(t *testing.T) {
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		time.Sleep(5 * time.Millisecond)
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(t.TempDir()+"/tasks.json", handler, handler, handler, func() int { return 30 }, func() int { return 1 })
	identity := Identity{ID: "metrics-user"}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "metrics", "draw", "gpt-image-2", "1024x1024", "high", "", 1, nil); err != nil {
		t.Fatal(err)
	}
	waitForTaskStatus(t, svc, identity, "metrics", TaskStatusSuccess)
	items := svc.ListTasks(identity, []string{"metrics"})["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	durations, ok := items[0]["stage_durations_ms"].(map[string]int64)
	if !ok {
		t.Fatalf("stage_durations_ms type = %T", items[0]["stage_durations_ms"])
	}
	for _, stage := range []string{"queue_wait", "prepare", "slot_wait", "account_wait", "upstream_prepare", "upstream_and_media", "result_processing", "image_download"} {
		if _, ok := durations[stage]; !ok {
			t.Fatalf("missing stage %q in %#v", stage, durations)
		}
	}
}
