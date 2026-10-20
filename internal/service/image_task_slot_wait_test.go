package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

// A task queued for a saturated channel must time out like any other phase
// instead of parking a worker forever on the submission-time context.
func TestImageTaskSlotWaitIsBoundedByTaskTimeout(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	handlerCalls := make(chan struct{}, 1)
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		handlerCalls <- struct{}{}
		return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
	}
	svc := NewImageTaskService(path, handler, handler, handler, func() int { return 30 }, func() int { return 1 })
	svc.SetTaskTimeoutGetter(func() time.Duration { return 150 * time.Millisecond })
	svc.SetWorkerPoolConfig(1, 8)
	// Another task holds the only channel slot for the whole test.
	svc.mu.Lock()
	svc.runningByChannel[imageTaskChannelGPT] = 1
	svc.mu.Unlock()

	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "task-1", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	waitForTaskStatus(t, svc, identity, "task-1", TaskStatusError)

	item := svc.ListTasks(identity, []string{"task-1"})["items"].([]map[string]any)[0]
	if item["error_code"] != "slot_wait_timeout" {
		t.Fatalf("error_code = %#v, want slot_wait_timeout in %#v", item["error_code"], item)
	}
	if item["progress"] != 100 || item["progress_stage"] != "失败" {
		t.Fatalf("terminal fields = %#v, want progress 100 and stage 失败", item)
	}
	select {
	case <-handlerCalls:
		t.Fatal("handler ran although the task never acquired a slot")
	default:
	}
	svc.mu.RLock()
	held := svc.runningByChannel[imageTaskChannelGPT]
	svc.mu.RUnlock()
	if held != 1 {
		t.Fatalf("channel slot counter = %d, want the manually held slot only", held)
	}
}
