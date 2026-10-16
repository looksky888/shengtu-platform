package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestImageTaskServiceRecoversHandlerPanic(t *testing.T) {
	handler := func(context.Context, Identity, map[string]any) (map[string]any, error) {
		panic("forced handler panic")
	}
	svc := NewImageTaskService(filepath.Join(t.TempDir(), "image_tasks.json"), handler, handler, handler, func() int { return 30 })
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	if _, err := svc.SubmitGeneration(context.Background(), identity, "panic-task", "draw", "gpt-image-2", "1024x1024", "high", "https://base.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}

	waitForTaskStatus(t, svc, identity, "panic-task", TaskStatusError)
	items := svc.ListTasks(identity, []string{"panic-task"})["items"].([]map[string]any)
	if len(items) != 1 || items[0]["error_code"] != "internal_panic" || items[0]["error"] != imageTaskInternalPanicMessage {
		t.Fatalf("panic task = %#v", items)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := svc.Close(ctx); err != nil {
		t.Fatalf("Close() after panic error = %v", err)
	}
}
