package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type blockingMediaObjects struct {
	*memoryMediaObjects
	gate    <-chan struct{}
	started chan<- struct{}
}

func (s *blockingMediaObjects) PutFile(ctx context.Context, key, path, contentType, shaValue string) error {
	select {
	case s.started <- struct{}{}:
	default:
	}
	select {
	case <-s.gate:
	case <-ctx.Done():
		return ctx.Err()
	}
	return s.memoryMediaObjects.PutFile(ctx, key, path, contentType, shaValue)
}

func uploadStoredMedia(t *testing.T, library *MediaLibrary) {
	t.Helper()
	library.retryPending(context.Background())
}

func waitForMediaStatus(t *testing.T, repo *storage.DatabaseBackend, rel, want string) storage.MediaAssetRecord {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		asset, ok, err := repo.LoadMediaAsset(rel)
		if err != nil {
			t.Fatalf("LoadMediaAsset() error = %v", err)
		}
		if ok && asset.Status == want {
			return asset
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("media %q did not reach status %q", rel, want)
	return storage.MediaAssetRecord{}
}

func TestMediaLibraryStoreImageDoesNotWaitForSlowObjectStorage(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	gate := make(chan struct{})
	started := make(chan struct{}, 1)
	library.objects = &blockingMediaObjects{memoryMediaObjects: objects, gate: gate, started: started}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	library.Start(ctx)

	startedAt := time.Now()
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	if elapsed := time.Since(startedAt); elapsed >= 200*time.Millisecond {
		t.Fatalf("StoreImage() waited for object storage: %v", elapsed)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("background upload did not start")
	}
	asset := waitForMediaStatus(t, repo, rel, mediaStatusPending)
	delivery, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Method: "GET"})
	if err != nil || delivery.LocalPath == "" {
		t.Fatalf("pending Delivery() = %#v err %v", delivery, err)
	}
	page, err := library.ListImages("", ImageListQuery{Scope: ImageAccessScope{OwnerID: "user-1"}, Limit: 20})
	if err != nil {
		t.Fatalf("ListImages() error = %v", err)
	}
	items, _ := page["items"].([]map[string]any)
	if len(items) != 1 || items[0]["storage_status"] != mediaStatusPending {
		t.Fatalf("pending image page = %#v", page)
	}
	metadata := GeneratedImageMetadata{ResolutionPreset: "2k", RequestedSize: "2048x2048", OutputFormat: "png"}
	if err := library.UpdateGeneratedImage(rel, "user-2", "Bob", ImageVisibilityPublic, metadata); err != nil {
		t.Fatalf("UpdateGeneratedImage() error = %v", err)
	}

	close(gate)
	asset = waitForMediaStatus(t, repo, rel, mediaStatusReady)
	if asset.OwnerID != "user-2" || asset.OwnerName != "Bob" || asset.Visibility != ImageVisibilityPublic || asset.ResolutionPreset != "2k" {
		t.Fatalf("metadata was overwritten by upload completion: %#v", asset)
	}
	if _, err := os.Stat(library.spoolPath(asset.ID, "original")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("original spool remains after upload: %v", err)
	}
}

func TestMediaLibraryStartRecoversDurablePendingUpload(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, _ := imageRelativePathFromValue(url)
	asset := waitForMediaStatus(t, repo, rel, mediaStatusPending)

	restarted := &MediaLibrary{
		config: library.config, repo: repo, objects: objects, spoolDir: library.spoolDir, prefix: library.prefix,
		uploadSem: make(chan struct{}, defaultMediaUploadConcurrency), transformSem: make(chan struct{}, defaultMediaTransformConcurrency),
		uploadQueue: make(chan storage.MediaAssetRecord, defaultMediaUploadQueueCapacity),
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	restarted.Start(ctx)
	asset = waitForMediaStatus(t, repo, rel, mediaStatusReady)
	if _, err := os.Stat(restarted.spoolPath(asset.ID, "original")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("recovered upload left original spool: %v", err)
	}
}
