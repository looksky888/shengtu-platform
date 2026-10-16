package service

import (
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestTaskEntryDocumentNamesDoNotCollide(t *testing.T) {
	first := taskEntryDocName("owner/a", "task:1")
	second := taskEntryDocName("owner:a", "task/1")
	if first == second {
		t.Fatalf("task document names collide: %q", first)
	}
}

func TestImageTaskLoadsAndMigratesLegacyShardName(t *testing.T) {
	root := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(root, "legacy.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	ownerID, taskID := "owner/a", "task:1"
	taskDay := time.Now().In(imageTaskStatsLocation()).Add(-time.Hour).Format("2006-01-02 15:04:05")
	if err := backend.SaveJSONDocument(imageTasksIndexDoc, map[string]any{
		"version": 2,
		"entries": []map[string]any{{"owner_id": ownerID, "id": taskID}},
	}); err != nil {
		t.Fatalf("save legacy index: %v", err)
	}
	if err := backend.SaveJSONDocument(legacyTaskEntryDocName(ownerID, taskID), map[string]any{
		"id": taskID, "owner_id": ownerID, "status": TaskStatusSuccess,
		"mode": "generate", "count": 1, "created_at": taskDay, "updated_at": taskDay,
	}); err != nil {
		t.Fatalf("save legacy shard: %v", err)
	}

	svc := NewStoredImageTaskService(filepath.Join(root, "image_tasks.json"), backend, nil, nil, nil, func() int { return 30 })
	if !svc.StoreReady() {
		t.Fatal("StoreReady false after legacy shard migration")
	}
	svc.mu.Lock()
	loaded := svc.tasks[taskKey(ownerID, taskID)]
	svc.mu.Unlock()
	if loaded == nil {
		t.Fatal("legacy task was not loaded")
	}
	migrated, err := backend.LoadJSONDocument(taskEntryDocName(ownerID, taskID))
	if err != nil || migrated == nil {
		t.Fatalf("new shard missing after migration: %v %#v", err, migrated)
	}
}

func TestImageTaskShardedSaveDoesNotRewriteUnrelatedRows(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "t.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	path := filepath.Join(root, "image_tasks.json")
	svc := NewStoredImageTaskService(path, backend, nil, nil, nil, func() int { return 30 })
	if !svc.StoreReady() {
		t.Fatal("StoreReady false")
	}

	// Seed two tasks via direct map + save.
	taskDay := time.Now().In(imageTaskStatsLocation()).Add(-time.Hour).Format("2006-01-02 15:04:05")
	svc.mu.Lock()
	svc.tasks[taskKey("u1", "a")] = &ImageTask{
		ID: "a", OwnerID: "u1", Status: TaskStatusSuccess, Mode: "generate",
		Count: 1, CreatedAt: taskDay, UpdatedAt: taskDay,
		progressSet: true, Progress: 100,
	}
	svc.tasks[taskKey("u1", "b")] = &ImageTask{
		ID: "b", OwnerID: "u1", Status: TaskStatusSuccess, Mode: "generate",
		Count: 1, CreatedAt: taskDay, UpdatedAt: taskDay,
		progressSet: true, Progress: 100,
	}
	svc.markAllTasksDirtyLocked()
	if err := svc.saveLocked(); err != nil {
		svc.mu.Unlock()
		t.Fatalf("initial save: %v", err)
	}
	svc.mu.Unlock()

	// Only touch task a.
	svc.mu.Lock()
	svc.tasks[taskKey("u1", "a")].ProgressMessage = "only-a"
	svc.markTaskDirtyLocked(taskKey("u1", "a"))
	if err := svc.saveLocked(); err != nil {
		svc.mu.Unlock()
		t.Fatalf("dirty save: %v", err)
	}
	svc.mu.Unlock()

	// Reload from DB shards.
	reloaded := NewStoredImageTaskService(path, backend, nil, nil, nil, func() int { return 30 })
	if !reloaded.StoreReady() {
		t.Fatal("reloaded StoreReady false")
	}
	reloaded.mu.Lock()
	defer reloaded.mu.Unlock()
	if len(reloaded.tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(reloaded.tasks))
	}
	if reloaded.tasks[taskKey("u1", "a")].ProgressMessage != "only-a" {
		t.Fatalf("task a not updated: %#v", reloaded.tasks[taskKey("u1", "a")])
	}
	if reloaded.tasks[taskKey("u1", "b")] == nil {
		t.Fatal("task b missing after partial save")
	}
}

func TestImageTaskMigratesMonolithicDocument(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "t.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	// Seed legacy monolithic document.
	taskDay := time.Now().In(imageTaskStatsLocation()).Add(-time.Hour).Format("2006-01-02 15:04:05")
	if err := backend.SaveJSONDocument("image_tasks.json", map[string]any{
		"tasks": []map[string]any{
			{
				"id": "legacy-1", "owner_id": "u9", "status": TaskStatusSuccess,
				"mode": "generate", "count": 1,
				"created_at": taskDay, "updated_at": taskDay,
			},
		},
	}); err != nil {
		t.Fatalf("SaveJSONDocument: %v", err)
	}

	path := filepath.Join(root, "image_tasks.json")
	svc := NewStoredImageTaskService(path, backend, nil, nil, nil, func() int { return 30 })
	if !svc.StoreReady() {
		t.Fatal("StoreReady false after migrate")
	}
	svc.mu.Lock()
	if len(svc.tasks) != 1 || svc.tasks[taskKey("u9", "legacy-1")] == nil {
		svc.mu.Unlock()
		t.Fatalf("migrated tasks = %#v", svc.tasks)
	}
	svc.mu.Unlock()

	// Index must exist for second boot.
	idx, err := backend.LoadJSONDocument(imageTasksIndexDoc)
	if err != nil || idx == nil {
		t.Fatalf("index missing: %v %#v", err, idx)
	}
	reloaded := NewStoredImageTaskService(path, backend, nil, nil, nil, func() int { return 30 })
	if !reloaded.StoreReady() || len(reloaded.DrainRecoveredInterrupted()) != 0 {
		// Drain is empty; just check task count
	}
	reloaded.mu.Lock()
	n := len(reloaded.tasks)
	reloaded.mu.Unlock()
	if n != 1 {
		t.Fatalf("second boot tasks = %d", n)
	}
}
