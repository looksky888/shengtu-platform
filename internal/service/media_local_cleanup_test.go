package service

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

func TestMediaLocalCleanupVerifiesBeforeDeleting(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	data := mediaPNG(t)
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	rel := "2026/08/14/sample.png"
	original := filepath.Join(library.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(original), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(original, data, 0o600); err != nil {
		t.Fatal(err)
	}
	asset := storage.MediaAssetRecord{
		ID: "asset-1", Path: rel, MediaType: "image", ObjectKey: "images/asset-1.png",
		ContentType: "image/png", SizeBytes: int64(len(data)), SHA256: hash,
		Status: mediaStatusReady, Visibility: ImageVisibilityPrivate, CreatedAt: "2026-08-14T00:00:00+08:00",
	}
	if err := repo.SaveMediaAsset(asset); err != nil {
		t.Fatal(err)
	}
	objects.data[asset.ObjectKey] = append([]byte(nil), data...)
	objects.sha[asset.ObjectKey] = hash

	library.TriggerLocalCleanup("verify", "")
	verified := waitForLocalCleanup(t, library)
	if verified.State != "succeeded" || verified.Eligible != 1 || verified.ReclaimableBytes != int64(len(data)) || verified.ConfirmationToken == "" {
		t.Fatalf("verification = %#v", verified)
	}
	if _, err := os.Stat(original); err != nil {
		t.Fatalf("verify removed local original: %v", err)
	}

	library.TriggerLocalCleanup("delete", verified.ConfirmationToken)
	deleted := waitForLocalCleanup(t, library)
	if deleted.State != "succeeded" || deleted.RemovedFiles != 1 || deleted.FreedBytes != int64(len(data)) {
		t.Fatalf("cleanup = %#v", deleted)
	}
	if _, err := os.Stat(original); !os.IsNotExist(err) {
		t.Fatalf("local original still exists: %v", err)
	}
	if _, ok, err := repo.LoadMediaAsset(rel); err != nil || !ok {
		t.Fatalf("media record must remain available: ok=%v err=%v", ok, err)
	}
}

func TestMediaLocalCleanupKeepsCopyWhenR2DigestMismatch(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	data := mediaPNG(t)
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	rel := "2026/08/14/mismatch.png"
	original := filepath.Join(library.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(original), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(original, data, 0o600); err != nil {
		t.Fatal(err)
	}
	asset := storage.MediaAssetRecord{ID: "asset-2", Path: rel, MediaType: "image", ObjectKey: "images/asset-2.png", SizeBytes: int64(len(data)), SHA256: hash, Status: mediaStatusReady, CreatedAt: "2026-08-14T00:00:00+08:00"}
	if err := repo.SaveMediaAsset(asset); err != nil {
		t.Fatal(err)
	}
	objects.data[asset.ObjectKey] = append([]byte(nil), data...)
	objects.sha[asset.ObjectKey] = "wrong"

	library.TriggerLocalCleanup("verify", "")
	status := waitForLocalCleanup(t, library)
	if status.State != "succeeded" || status.Failed != 1 || status.Eligible != 0 {
		t.Fatalf("verification = %#v", status)
	}
	if _, err := os.Stat(original); err != nil {
		t.Fatalf("unsafe cleanup removed local original: %v", err)
	}
}

func waitForLocalCleanup(t *testing.T, library *MediaLibrary) MediaLocalCleanupStatus {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		status := library.LocalCleanupStatus()
		if status.State != "running" {
			return status
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("local cleanup timed out: %#v", library.LocalCleanupStatus())
	return MediaLocalCleanupStatus{}
}
