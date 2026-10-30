package service

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestSweepOrphanedImageDocumentsKeepsLiveFilesAndUntouchedNamespaces(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.ToSlash(filepath.Join(dir, "test.db"))
	backend, err := storage.NewDatabaseBackend("sqlite:///" + dbPath)
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	cfg := testImageConfig{root: dir}
	liveRel := "2026/10/30/live.png"
	orphanRel := "2026/10/01/orphan.png"
	liveFull := filepath.Join(cfg.ImagesDir(), filepath.FromSlash(liveRel))
	if err := os.MkdirAll(filepath.Dir(liveFull), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(liveFull, []byte("png"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	mustSave := func(name string) {
		t.Helper()
		if err := backend.SaveJSONDocument(name, map[string]any{"ok": true}); err != nil {
			t.Fatalf("SaveJSONDocument(%s): %v", name, err)
		}
	}
	mustSave(imageOwnerDocumentName(liveRel))
	mustSave(thumbnailMetadataDocumentName(liveRel))
	mustSave(imageOwnerDocumentName(orphanRel))
	mustSave(thumbnailMetadataDocumentName(orphanRel))
	mustSave("credits/state.json")
	mustSave("imageXmetadata/should_not_match_underscore.json")

	svc := NewImageService(cfg, backend)
	svc.galleryIndex = &imageGalleryIndex{
		Version:  imageGalleryIndexVersion,
		Complete: true,
		Entries: map[string]*imageIndexEntry{
			liveRel:   {Path: liveRel, Name: "live.png"},
			orphanRel: {Path: orphanRel, Name: "orphan.png"},
		},
	}

	removed := svc.SweepOrphanedImageDocuments()
	if removed != 2 {
		t.Fatalf("SweepOrphanedImageDocuments() = %d, want 2", removed)
	}

	for _, deletedKey := range []string{imageOwnerDocumentName(orphanRel), thumbnailMetadataDocumentName(orphanRel)} {
		val, err := backend.LoadJSONDocument(deletedKey)
		if err != nil {
			t.Fatalf("LoadJSONDocument(%s): %v", deletedKey, err)
		}
		if val != nil {
			t.Fatalf("expected %s to be deleted, still present", deletedKey)
		}
	}
	for _, keptKey := range []string{
		imageOwnerDocumentName(liveRel),
		thumbnailMetadataDocumentName(liveRel),
		"credits/state.json",
		"imageXmetadata/should_not_match_underscore.json",
	} {
		val, err := backend.LoadJSONDocument(keptKey)
		if err != nil {
			t.Fatalf("LoadJSONDocument(%s): %v", keptKey, err)
		}
		if val == nil {
			t.Fatalf("expected %s to remain intact", keptKey)
		}
	}
	if _, ok := svc.galleryIndex.Entries[orphanRel]; ok {
		t.Fatalf("expected orphanRel to be evicted from galleryIndex")
	}
	if _, ok := svc.galleryIndex.Entries[liveRel]; !ok {
		t.Fatalf("expected liveRel to remain in galleryIndex")
	}
}

func TestMarkBillingReconciledPersistsAndSkipsFutureCandidateScans(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.ToSlash(filepath.Join(dir, "tasks.db"))
	backend, err := storage.NewDatabaseBackend("sqlite:///" + dbPath)
	if err != nil {
		t.Fatalf("NewDatabaseBackend: %v", err)
	}
	defer backend.Close()

	tasksPath := filepath.Join(dir, "image_tasks.json")
	svc := NewStoredImageTaskService(tasksPath, backend, nil, nil, nil, func() int { return 30 })

	svc.mu.Lock()
	svc.tasks[taskKey("u_1", "task_err_1")] = &ImageTask{
		ID:        "task_err_1",
		OwnerID:   "u_1",
		Status:    TaskStatusError,
		Mode:      "generate",
		Model:     "gpt-image-1",
		Count:     2,
		CreatedAt: "2026-10-30 10:00:00",
		UpdatedAt: "2026-10-30 10:00:05",
	}
	svc.markAllTasksDirtyLocked()
	if err := svc.saveLocked(); err != nil {
		svc.mu.Unlock()
		t.Fatalf("saveLocked: %v", err)
	}
	svc.mu.Unlock()

	if got := len(svc.FailedBillingCandidates()); got != 1 {
		t.Fatalf("FailedBillingCandidates() before reconcile = %d, want 1", got)
	}

	svc.MarkBillingReconciled("u_1", "task_err_1")
	_ = svc.Close(context.Background())

	reloaded := NewStoredImageTaskService(tasksPath, backend, nil, nil, nil, func() int { return 30 })
	defer func() { _ = reloaded.Close(context.Background()) }()
	if got := len(reloaded.FailedBillingCandidates()); got != 0 {
		t.Fatalf("FailedBillingCandidates() after reload = %d, want 0", got)
	}
}
