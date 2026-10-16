package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCleanupOldImagesIfDueThrottlesRepeatedScans(t *testing.T) {
	store := &Store{
		DataDir: t.TempDir(),
		data: map[string]any{
			"image_retention_days":       1,
			"media_storage_provider":     "local",
			"media_auto_cleanup_enabled": true,
		},
	}

	first := writeOldImageFile(t, store.ImagesDir(), "first.png")
	if removed := store.CleanupOldImagesIfDue(); removed != 1 {
		t.Fatalf("first cleanup removed %d files, want 1", removed)
	}
	if _, err := os.Stat(first); !os.IsNotExist(err) {
		t.Fatalf("first old image still exists or unexpected stat error: %v", err)
	}

	second := writeOldImageFile(t, store.ImagesDir(), "second.png")
	if removed := store.CleanupOldImagesIfDue(); removed != 0 {
		t.Fatalf("second cleanup removed %d files, want throttled 0", removed)
	}
	if _, err := os.Stat(second); err != nil {
		t.Fatalf("second old image should remain while throttled: %v", err)
	}

	if removed := store.CleanupOldImages(); removed != 1 {
		t.Fatalf("forced cleanup removed %d files, want 1", removed)
	}
}

func TestCleanupOldImagesHonorsSevenDayRetention(t *testing.T) {
	store := &Store{DataDir: t.TempDir(), data: map[string]any{
		"image_retention_days":       7,
		"media_storage_provider":     "local",
		"media_auto_cleanup_enabled": true,
	}}
	old := writeImageFileAt(t, store.ImagesDir(), "eight-days-old.png", time.Now().Add(-8*24*time.Hour))
	recent := writeImageFileAt(t, store.ImagesDir(), "six-days-old.png", time.Now().Add(-6*24*time.Hour))

	if removed := store.CleanupOldImages(); removed != 1 {
		t.Fatalf("CleanupOldImages() removed %d files, want 1", removed)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("eight-day-old image remains: %v", err)
	}
	if _, err := os.Stat(recent); err != nil {
		t.Fatalf("six-day-old image was removed: %v", err)
	}
}

func TestCleanupOldImagesDoesNotDeleteLocalFilesInR2Mode(t *testing.T) {
	store := &Store{
		DataDir: t.TempDir(),
		data: map[string]any{
			"image_retention_days":       1,
			"media_storage_provider":     "r2",
			"media_auto_cleanup_enabled": true,
		},
	}
	old := writeOldImageFile(t, store.ImagesDir(), "not-yet-migrated.png")

	if store.MediaAutoCleanupEnabled() {
		t.Fatal("MediaAutoCleanupEnabled() = true in R2 mode, want false")
	}
	if removed := store.CleanupOldImages(); removed != 0 {
		t.Fatalf("CleanupOldImages() removed %d files in R2 mode, want 0", removed)
	}
	if _, err := os.Stat(old); err != nil {
		t.Fatalf("R2 mode removed local image: %v", err)
	}
}

func writeOldImageFile(t *testing.T, dir, name string) string {
	t.Helper()
	return writeImageFileAt(t, dir, name, time.Now().Add(-48*time.Hour))
}

func writeImageFileAt(t *testing.T, dir, name string, modifiedAt time.Time) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatalf("write old image: %v", err)
	}
	if err := os.Chtimes(path, modifiedAt, modifiedAt); err != nil {
		t.Fatalf("chtime old image: %v", err)
	}
	return path
}
