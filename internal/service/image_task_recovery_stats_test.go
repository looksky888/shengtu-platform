package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Boot recovery must produce a complete terminal record and count the task in
// the durable stats ledger: recovery runs before the ledger backfill, and the
// recovered row carries the same terminal fields finishActiveTask writes.
func TestImageTaskBootRecoveryCompletesTaskAndRecordsStats(t *testing.T) {
	cases := []struct {
		name   string
		status string
	}{
		{name: "queued", status: TaskStatusQueued},
		{name: "running", status: TaskStatusRunning},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "image_tasks.json")
			doc := map[string]any{"tasks": []map[string]any{{
				"id": "interrupted", "owner_id": "user-1", "status": tc.status, "mode": "generate",
				"count": 2, "progress": 55, "progress_stage": "正在启动生成", "progress_message": "调用上游生图",
				"created_at": "2026-07-15 10:00:00", "updated_at": "2026-07-15 10:00:05",
				"started_at": "2026-07-15 10:00:01", "log_count": 3,
				"events": []map[string]any{{"time": "2026-07-15 10:00:02", "stage": "prepare", "message": "初始化任务上下文"}},
			}}}
			raw, err := json.Marshal(doc)
			if err != nil {
				t.Fatalf("Marshal() error = %v", err)
			}
			if err := os.WriteFile(path, raw, 0o644); err != nil {
				t.Fatalf("WriteFile() error = %v", err)
			}

			svc := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
			task := svc.tasks[taskKey("user-1", "interrupted")]
			if task == nil {
				t.Fatal("interrupted task disappeared during boot recovery")
			}
			if task.Status != TaskStatusError {
				t.Fatalf("status = %q, want %q", task.Status, TaskStatusError)
			}
			if task.Progress != 100 || task.ProgressStage != "失败" || task.ProgressMessage == "" {
				t.Fatalf("progress fields = %d/%q/%q, want terminal failure state", task.Progress, task.ProgressStage, task.ProgressMessage)
			}
			if task.FinishedAt == "" {
				t.Fatal("recovered task has no finished_at")
			}
			if !task.durationSecondsSet {
				t.Fatal("recovered task has no duration_seconds")
			}
			if len(task.Events) != 2 || task.Events[len(task.Events)-1]["status"] != TaskStatusError {
				t.Fatalf("events = %#v, want a terminal event appended", task.Events)
			}
			if task.LogCount != len(task.Events) {
				t.Fatalf("log_count = %d, want %d", task.LogCount, len(task.Events))
			}

			loc := imageTaskStatsLocation()
			now := time.Now().In(loc)
			start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -1)
			end := start.AddDate(0, 0, 4)
			stats := svc.StatsBetween("day", start, end)
			if stats.FailedTasks != 1 || stats.FailedImages != 2 {
				t.Fatalf("stats after recovery = %#v, want one failed task with 2 failed images", stats)
			}

			// The recovered count is durable: a fresh boot reads it from the ledger.
			reloaded := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
			reloadedStats := reloaded.StatsBetween("day", start, end)
			if reloadedStats.FailedTasks != 1 || reloadedStats.FailedImages != 2 {
				t.Fatalf("reloaded stats = %#v, want the recovered task recorded", reloadedStats)
			}
		})
	}
}
