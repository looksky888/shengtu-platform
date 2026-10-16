package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestMediaLibraryMetricsUsesDurablePendingCount(t *testing.T) {
	if got := (*MediaLibrary)(nil).Metrics(); got.Status != "local" || got.PendingUploads != 0 {
		t.Fatalf("nil media library metrics = %#v", got)
	}
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "media-metrics.db")))
	if err != nil {
		t.Fatal(err)
	}
	asset := storage.MediaAssetRecord{
		ID: "pending", Path: "pending.png", MediaType: "image", ObjectKey: "objects/pending.png",
		ContentType: "image/png", Visibility: "private", Status: "pending",
		CreatedAt: "2026-08-31T10:00:00Z", UpdatedAt: "2026-08-31T10:00:00Z",
	}
	if err := backend.SaveMediaAsset(asset); err != nil {
		t.Fatal(err)
	}
	library := &MediaLibrary{repo: backend}
	if got := library.Metrics(); got.Status != "ok" || got.PendingUploads != 1 || got.Error != "" {
		t.Fatalf("pending media metrics = %#v", got)
	}
	if err := backend.Close(); err != nil {
		t.Fatal(err)
	}
	if got := library.Metrics(); got.Status != "error" || got.Error == "" {
		t.Fatalf("closed database media metrics = %#v", got)
	}
}
