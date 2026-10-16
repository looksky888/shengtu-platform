package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/util"
)

func TestImageTaskServiceLimitsConcurrentImageSlots(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan string, 2)
	release := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		started <- payload["prompt"].(string)
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	// GPT multi-output runs serially under one account reservation, so one task
	// occupies one channel slot regardless of n.
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 1 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "first", "gpt-image-2", "1024x1024", "high", "https://base.test", 2, nil); err != nil {
		t.Fatalf("SubmitGeneration(first) error = %v", err)
	}
	if got := waitForStartedTask(t, started); got != "first" {
		t.Fatalf("started task = %q, want first", got)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-2", "second", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(second) error = %v", err)
	}

	time.Sleep(350 * time.Millisecond)
	if got := svc.ListTasks(identity, []string{"task-2"}); got["items"].([]map[string]any)[0]["status"] != TaskStatusQueued {
		t.Fatalf("second task should stay queued while first holds image slots: %#v", got)
	}
	select {
	case prompt := <-started:
		t.Fatalf("second task started before slots were released: %s", prompt)
	default:
	}

	close(release)
	if got := waitForStartedTask(t, started); got != "second" {
		t.Fatalf("started task after release = %q, want second", got)
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "task-2", TaskStatusSuccess)
}

func TestImageTaskServiceGrokAndGPTUseIndependentSlots(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan string, 4)
	release := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		started <- util.Clean(payload["model"]) + ":" + util.Clean(payload["prompt"])
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	// Different channels own separate buckets. With the local limit at 2, two
	// GPT tasks may run while the Grok channel is also active.
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 2 })
	identity := Identity{ID: "alice", Name: "Alice", Role: "user"}

	if _, err := svc.SubmitGeneration(context.Background(), identity, "gpt-1", "gpt-job", "gpt-image-2", "1024x1024", "high", "https://base.test", 2, nil); err != nil {
		t.Fatalf("SubmitGeneration(gpt) error = %v", err)
	}
	if got := waitForStartedTask(t, started); got != "gpt-image-2:gpt-job" {
		t.Fatalf("started = %q, want gpt-image-2:gpt-job", got)
	}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "grok-1", "grok-job", "grok-imagine-image", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(grok) error = %v", err)
	}
	select {
	case got := <-started:
		if got != "grok-imagine-image:grok-job" {
			t.Fatalf("started = %q, want grok-imagine-image:grok-job", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("grok task should start even when GPT channel slots are full")
	}

	// The local GPT channel has a second independent slot, so this task may
	// start without waiting for the Grok task or the first GPT task.
	if _, err := svc.SubmitGeneration(context.Background(), identity, "gpt-2", "gpt-wait", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(gpt-2) error = %v", err)
	}
	if got := waitForStartedTask(t, started); got != "gpt-image-2:gpt-wait" {
		t.Fatalf("started = %q, want gpt-image-2:gpt-wait", got)
	}

	close(release)
	waitForTaskStatus(t, svc, identity, "gpt-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "grok-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "gpt-2", TaskStatusSuccess)
}

func TestImageTaskServiceUserConcurrencyIsIndependentPerLane(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan string, 2)
	release := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		started <- util.Clean(payload["prompt"])
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 8 }, func() int { return 1 }, nil)
	identity := Identity{ID: "lane-user", Name: "Lane User", Role: AuthRoleUser}
	relayMetadata := map[string]any{
		"effective_provider": ImageTaskProviderProxyAPI,
		"effective_channel":  "image_channel:relay-1",
	}
	if _, err := svc.SubmitGenerationWithMetadata(context.Background(), identity, "local", "local", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil, nil); err != nil {
		t.Fatalf("local task: %v", err)
	}
	if got := waitForStartedTask(t, started); got != "local" {
		t.Fatalf("started = %q, want local", got)
	}
	if _, err := svc.SubmitGenerationWithMetadata(context.Background(), identity, "relay", "relay", "gpt-image-relay", "1024x1024", "high", "https://base.test", 1, nil, relayMetadata); err != nil {
		t.Fatalf("relay task should use an independent user concurrency lane: %v", err)
	}
	if got := waitForStartedTask(t, started); got != "relay" {
		t.Fatalf("started = %q, want relay", got)
	}
	close(release)
	waitForTaskStatus(t, svc, identity, "local", TaskStatusSuccess)
	waitForTaskStatus(t, svc, identity, "relay", TaskStatusSuccess)
}

func TestImageTaskChannelMapping(t *testing.T) {
	if got := imageTaskChannel("gpt-image-2"); got != imageTaskChannelGPT {
		t.Fatalf("gpt channel = %q", got)
	}
	if got := imageTaskChannel("grok-imagine-image"); got != imageTaskChannelGrok {
		t.Fatalf("grok channel = %q", got)
	}
	if got := imageTaskChannel("auto"); got != imageTaskChannelGPT {
		t.Fatalf("auto channel = %q", got)
	}
}

func TestImageTaskTimeoutUsesFrozenChannelValue(t *testing.T) {
	svc := &ImageTaskService{taskTimeoutGetter: func() time.Duration { return 2 * time.Minute }}
	if got := svc.taskTimeoutForPayload("generate", map[string]any{"channel_timeout_seconds": 420}); got != 7*time.Minute {
		t.Fatalf("channel task timeout = %s, want 7m", got)
	}
	if got := svc.taskTimeoutForPayload("generate", map[string]any{"channel_timeout_seconds": 12}); got != 2*time.Minute {
		t.Fatalf("invalid channel timeout = %s, want global 2m", got)
	}
	if got := svc.taskTimeoutForPayload("video", map[string]any{"channel_timeout_seconds": 420}); got != videoTaskMinTimeout {
		t.Fatalf("video timeout = %s, want %s", got, videoTaskMinTimeout)
	}
}

func TestImageTaskGlobalCap(t *testing.T) {
	if got := imageTaskGlobalCap(2); got != 2 {
		t.Fatalf("globalCap(2) = %d, want 2", got)
	}
	if got := imageTaskGlobalCap(4); got != 4 {
		t.Fatalf("globalCap(4) = %d, want 4", got)
	}
	if got := imageTaskGlobalCap(1); got != 1 {
		t.Fatalf("globalCap(1) = %d, want 1", got)
	}
}

func TestImageTaskServiceLimitsUserDefaultConcurrentImages(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	started := make(chan string, 2)
	release := make(chan struct{})
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		started <- payload["prompt"].(string)
		<-release
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 8 }, func() int { return 2 }, nil)
	alice := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	bob := Identity{ID: "bob", Name: "Bob", Role: AuthRoleUser}

	if _, err := svc.SubmitGeneration(context.Background(), alice, "task-1", "first", "gpt-image-2", "1024x1024", "high", "https://base.test", 2, nil); err != nil {
		t.Fatalf("SubmitGeneration(first) error = %v", err)
	}
	if got := waitForStartedTask(t, started); got != "first" {
		t.Fatalf("started task = %q, want first", got)
	}
	if _, err := svc.SubmitGeneration(context.Background(), alice, "task-2", "second", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err == nil {
		t.Fatal("SubmitGeneration(second) error = nil, want user limit")
	} else {
		var limitErr ImageTaskLimitError
		if !errors.As(err, &limitErr) {
			t.Fatalf("SubmitGeneration(second) error = %T %v, want ImageTaskLimitError", err, err)
		}
	}
	if _, err := svc.SubmitGeneration(context.Background(), bob, "task-1", "bob", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(bob) should use an independent limit: %v", err)
	}
	close(release)
	waitForTaskStatus(t, svc, alice, "task-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, bob, "task-1", TaskStatusSuccess)
}

func TestImageTaskServiceLimitsUserDefaultRPM(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handler := func(ctx context.Context, identity Identity, payload map[string]any) (map[string]any, error) {
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 8 }, nil, func() int { return 1 })
	user := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	admin := Identity{ID: "admin", Name: "Admin", Role: AuthRoleAdmin}

	if _, err := svc.SubmitGeneration(context.Background(), user, "task-1", "first", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration(first) error = %v", err)
	}
	waitForTaskStatus(t, svc, user, "task-1", TaskStatusSuccess)
	if _, err := svc.SubmitGeneration(context.Background(), user, "task-2", "second", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err == nil {
		t.Fatal("SubmitGeneration(second) error = nil, want RPM limit")
	} else {
		var limitErr ImageTaskLimitError
		if !errors.As(err, &limitErr) {
			t.Fatalf("SubmitGeneration(second) error = %T %v, want ImageTaskLimitError", err, err)
		}
	}
	if _, err := svc.SubmitGeneration(context.Background(), admin, "task-1", "admin first", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("admin should bypass user RPM limit: %v", err)
	}
	if _, err := svc.SubmitGeneration(context.Background(), admin, "task-2", "admin second", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("admin should bypass user RPM limit on second request: %v", err)
	}
	waitForTaskStatus(t, svc, admin, "task-1", TaskStatusSuccess)
	waitForTaskStatus(t, svc, admin, "task-2", TaskStatusSuccess)
}
