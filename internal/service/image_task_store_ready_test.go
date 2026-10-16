package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestImageTaskServiceRefusesSaveWhenLoadFailed(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "image_tasks.json")
	// Corrupt durable document so load fails.
	if err := os.WriteFile(path, []byte("{broken"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	svc := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
	if svc.StoreReady() {
		t.Fatal("StoreReady() = true, want false after corrupt load")
	}
	// saveLocked must refuse so we never wipe the corrupt-but-recoverable file with {}.
	svc.mu.Lock()
	err := svc.saveLocked()
	svc.mu.Unlock()
	if err == nil {
		t.Fatal("saveLocked() succeeded after failed load")
	}
	// File content must still be the corrupt payload (not rewritten empty).
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(raw) != "{broken" {
		t.Fatalf("file was rewritten: %q", raw)
	}
}

func TestImageTaskServiceReadyOnMissingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing", "image_tasks.json")
	svc := NewImageTaskService(path, nil, nil, nil, func() int { return 30 })
	if !svc.StoreReady() {
		t.Fatal("StoreReady() = false on missing file, want true (empty store)")
	}
}
