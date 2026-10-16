package service

import (
	"path/filepath"
	"testing"
	"time"
)

func TestLoadLockedRestoresProgressAndEvents(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "image_tasks.json")
	svc := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })

	key := taskKey("owner-1", "task-restore-1")
	now := time.Now()
	createdAt := now.Add(-time.Minute).Format("2006-01-02 15:04:05")
	finishedAt := now.Format("2006-01-02 15:04:05")
	svc.mu.Lock()
	svc.tasks[key] = imageTaskFromMap(map[string]any{
		"id":                   "task-restore-1",
		"owner_id":             "owner-1",
		"owner_name":           "Alice",
		"status":               TaskStatusSuccess,
		"mode":                 "generate",
		"model":                "gpt-image-1",
		"size":                 "1024x1024",
		"count":                1,
		"created_at":           createdAt,
		"updated_at":           finishedAt,
		"progress":             100,
		"progress_stage":       "已完成",
		"progress_message":     "任务已完成",
		"account_label":        "a***@outlook.com",
		"account_token_hash":   "abc123-xyz",
		"account_switch_count": 2,
		"log_count":            3,
		"started_at":           createdAt,
		"finished_at":          finishedAt,
		"duration_seconds":     59.0,
		"events": []map[string]any{
			{"time": "2026-07-10 12:00:01", "stage": "prepare", "message": "init"},
			{"time": "2026-07-10 12:00:10", "stage": "account_ready", "message": "ok"},
		},
	})
	if err := svc.saveLocked(); err != nil {
		svc.mu.Unlock()
		t.Fatalf("save: %v", err)
	}
	svc.mu.Unlock()

	// Reload from disk
	reloaded := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
	got := reloaded.tasks[key]
	if got == nil {
		t.Fatal("task missing after reload")
	}
	if utilClean(got.AccountLabel) != "a***@outlook.com" {
		t.Fatalf("account_label = %#v", got.AccountLabel)
	}
	if utilClean(got.ProgressStage) != "已完成" {
		t.Fatalf("progress_stage = %#v", got.ProgressStage)
	}
	if utilClean(got.AccountTokenHash) != "abc123-xyz" {
		t.Fatalf("account_token_hash = %#v", got.AccountTokenHash)
	}
	if len(got.Events) != 2 {
		t.Fatalf("events len = %d, want 2: %#v", len(got.Events), got.Events)
	}
	if got.AccountSwitchCount != 2 {
		t.Fatalf("switch_count = %#v", got.AccountSwitchCount)
	}
}
