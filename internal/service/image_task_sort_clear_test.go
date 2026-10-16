package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/util"
)

func TestListTaskLogsSortsByCreatedAtNewestFirst(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	base := time.Now().Add(-24 * time.Hour)
	format := func(value time.Time) string { return value.Format("2006-01-02 15:04:05") }
	raw := map[string]any{"tasks": []map[string]any{
		{"id": "old", "owner_id": "a", "owner_name": "A", "status": TaskStatusSuccess, "mode": "generate", "created_at": format(base.Add(-72 * time.Hour)), "updated_at": format(base.Add(-time.Hour))},
		{"id": "new", "owner_id": "b", "owner_name": "B", "status": TaskStatusError, "mode": "generate", "created_at": format(base), "updated_at": format(base.Add(time.Minute))},
		{"id": "mid", "owner_id": "c", "owner_name": "C", "status": TaskStatusCancelled, "mode": "edit", "created_at": format(base.Add(-24 * time.Hour)), "updated_at": format(base.Add(-23 * time.Hour))},
	}}
	data, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	svc := NewImageTaskService(path, failingImageTaskHandler, failingImageTaskHandler, failingImageTaskHandler, func() int { return 30 })
	got := svc.ListTaskLogs(map[string]string{"limit": "10", "offset": "0", "summary": "true"})
	items := got["items"].([]map[string]any)
	if len(items) != 3 {
		t.Fatalf("len=%d items=%#v", len(items), items)
	}
	// newest created_at first (new > mid > old), even if old has later updated_at
	if util.Clean(items[0]["id"]) != "new" || util.Clean(items[1]["id"]) != "mid" || util.Clean(items[2]["id"]) != "old" {
		t.Fatalf("order = %#v %#v %#v", items[0]["id"], items[1]["id"], items[2]["id"])
	}
}

func TestAdminClearTasksRemovesFinishedOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "image_tasks.json")
	now := time.Now()
	format := func(value time.Time) string { return value.Format("2006-01-02 15:04:05") }
	raw := map[string]any{"tasks": []map[string]any{
		{"id": "ok", "owner_id": "a", "status": TaskStatusSuccess, "mode": "generate", "created_at": format(now.Add(-2 * time.Hour)), "updated_at": format(now.Add(-time.Hour))},
		{"id": "bad", "owner_id": "a", "status": TaskStatusError, "mode": "generate", "created_at": format(now.Add(-4 * time.Hour)), "updated_at": format(now.Add(-3 * time.Hour))},
	}}
	data, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	svc := NewImageTaskService(path, failingImageTaskHandler, failingImageTaskHandler, failingImageTaskHandler, func() int { return 30 })
	// inject active task after load (load would recover unfinished as error)
	svc.mu.Lock()
	svc.tasks["a:run"] = imageTaskFromMap(map[string]any{
		"id": "run", "owner_id": "a", "status": TaskStatusRunning, "mode": "generate",
		"created_at": format(now.Add(-30 * time.Minute)), "updated_at": format(now.Add(-time.Minute)),
	})
	svc.mu.Unlock()

	res, err := svc.AdminClearTasks("finished")
	if err != nil {
		t.Fatalf("AdminClearTasks: %v", err)
	}
	removed, _ := res["removed"].(int)
	if removed != 2 {
		t.Fatalf("removed=%#v want 2 full=%#v", res["removed"], res)
	}

	got := svc.ListTaskLogs(map[string]string{"limit": "50"})
	items := got["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("remaining items=%#v", items)
	}
	if util.Clean(items[0]["id"]) != "run" || util.Clean(items[0]["status"]) != TaskStatusRunning {
		t.Fatalf("expected running task kept, got %#v", items[0])
	}
}
