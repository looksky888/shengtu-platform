package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
)

type mediaTestConfig struct{ root string }

func (c mediaTestConfig) MediaStorageProvider() string   { return "r2" }
func (c mediaTestConfig) MediaR2AccountID() string       { return "account" }
func (c mediaTestConfig) MediaR2AccessKeyID() string     { return "access" }
func (c mediaTestConfig) MediaR2SecretAccessKey() string { return "secret" }
func (c mediaTestConfig) MediaR2Bucket() string          { return "bucket" }
func (c mediaTestConfig) MediaR2Prefix() string          { return "test" }
func (c mediaTestConfig) MediaR2PresignTTLSeconds() int  { return 300 }
func (c mediaTestConfig) MediaSpoolDir() string          { return filepath.Join(c.root, "spool") }
func (c mediaTestConfig) ImagesDir() string              { return filepath.Join(c.root, "images") }
func (c mediaTestConfig) ImageThumbnailsDir() string {
	return filepath.Join(c.root, "image_thumbnails")
}
func (c mediaTestConfig) ImageMetadataDir() string { return filepath.Join(c.root, "image_metadata") }
func (c mediaTestConfig) BaseURL() string          { return "https://app.example.test" }

type memoryMediaObjects struct {
	mu         sync.Mutex
	data       map[string][]byte
	sha        map[string]string
	failPut    bool
	failDelete string
	putCalls   int
	presigned  string
}

func newMemoryMediaObjects() *memoryMediaObjects {
	return &memoryMediaObjects{data: map[string][]byte{}, sha: map[string]string{}}
}

func (s *memoryMediaObjects) PutFile(ctx context.Context, key, path, _, shaValue string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failPut {
		return errors.New("put failed")
	}
	s.putCalls++
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	s.data[key] = append([]byte(nil), data...)
	s.sha[key] = shaValue
	return nil
}

func (s *memoryMediaObjects) Get(_ context.Context, key string) (io.ReadCloser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.data[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return io.NopCloser(bytes.NewReader(append([]byte(nil), data...))), nil
}

func (s *memoryMediaObjects) Head(_ context.Context, key string) (mediaObjectInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.data[key]
	if !ok {
		return mediaObjectInfo{}, errors.New("not found")
	}
	return mediaObjectInfo{SizeBytes: int64(len(data)), SHA256: s.sha[key]}, nil
}

func (s *memoryMediaObjects) PresignGet(_ context.Context, key string, _ time.Duration) (string, error) {
	s.presigned = "GET"
	return "https://r2.example.test/" + key, nil
}

func (s *memoryMediaObjects) PresignHead(_ context.Context, key string, _ time.Duration) (string, error) {
	s.presigned = "HEAD"
	return "https://r2.example.test/" + key, nil
}

func (s *memoryMediaObjects) PresignDownload(_ context.Context, key string, _ time.Duration, disposition string) (string, error) {
	s.presigned = "DOWNLOAD:" + disposition
	return "https://r2.example.test/" + key, nil
}

func (s *memoryMediaObjects) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if key == s.failDelete {
		return errors.New("delete failed")
	}
	delete(s.data, key)
	delete(s.sha, key)
	return nil
}

func (s *memoryMediaObjects) Health(context.Context) error { return nil }

func mediaPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 6))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return out.Bytes()
}

func newMediaLibraryTestFixture(t *testing.T) (*MediaLibrary, *storage.DatabaseBackend, *memoryMediaObjects) {
	t.Helper()
	root := t.TempDir()
	repo, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(root, "media.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = repo.Close() })
	objects := newMemoryMediaObjects()
	spool := filepath.Join(root, "spool")
	if err := os.MkdirAll(spool, 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	library := &MediaLibrary{
		config: mediaTestConfig{root: root}, repo: repo, objects: objects, spoolDir: spool, prefix: "test",
		uploadSem: make(chan struct{}, defaultMediaUploadConcurrency), transformSem: make(chan struct{}, defaultMediaTransformConcurrency),
		uploadQueue: make(chan storage.MediaAssetRecord, defaultMediaUploadQueueCapacity),
	}
	return library, repo, objects
}

func TestMediaLibraryStoreImageUploadsAndVerifiesObjects(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	if !strings.HasPrefix(url, "https://app.example.test/images/") {
		t.Fatalf("url = %q", url)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	uploadStoredMedia(t, library)
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}
	if asset.Status != mediaStatusReady || asset.Width != 8 || asset.Height != 6 {
		t.Fatalf("asset = %#v", asset)
	}
	if len(objects.data) != 2 {
		t.Fatalf("stored objects = %d, want original and thumbnail", len(objects.data))
	}
	if _, err := os.Stat(library.spoolPath(asset.ID, "original")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("original spool remains: %v", err)
	}
	delivery, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Method: "GET"})
	if err != nil || !strings.HasPrefix(delivery.RedirectURL, "https://r2.example.test/") {
		t.Fatalf("Delivery() = %#v err %v", delivery, err)
	}
}

func TestMediaLibraryOpenStreamsOriginalObject(t *testing.T) {
	library, repo, _ := newMediaLibraryTestFixture(t)
	payload := mediaPNG(t)
	url, err := library.StoreImage(payload, "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}
	reader, contentType, err := library.Open(context.Background(), asset)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer reader.Close()
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("Open() payload length = %d, want %d", len(got), len(payload))
	}
	if contentType != "image/png" {
		t.Fatalf("Open() content type = %q", contentType)
	}
}

func TestMediaLibraryUploadFailurePersistsSpoolAndRetryRecovers(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	objects.failPut = true
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, _ := imageRelativePathFromValue(url)
	uploadStoredMedia(t, library)
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok || asset.Status != mediaStatusPending || asset.LastError == "" {
		t.Fatalf("pending asset = %#v ok %v err %v", asset, ok, err)
	}
	delivery, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Method: "GET"})
	if err != nil || delivery.LocalPath == "" {
		t.Fatalf("pending Delivery() = %#v err %v", delivery, err)
	}
	objects.failPut = false
	asset.RetryAt = ""
	if err := repo.SaveMediaAsset(asset); err != nil {
		t.Fatalf("SaveMediaAsset() error = %v", err)
	}
	library.retryPending(context.Background())
	asset, _, err = repo.LoadMediaAsset(rel)
	if err != nil || asset.Status != mediaStatusReady {
		t.Fatalf("retried asset = %#v err %v", asset, err)
	}
	if _, err := os.Stat(delivery.LocalPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("spool remains after retry: %v", err)
	}
}

func TestMediaLibraryDeliveryUsesMatchingPresignMethod(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, _ := imageRelativePathFromValue(url)
	uploadStoredMedia(t, library)
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}

	if _, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Thumbnail: true, Method: "HEAD"}); err != nil {
		t.Fatalf("HEAD Delivery() error = %v", err)
	}
	if objects.presigned != "HEAD" {
		t.Fatalf("HEAD Delivery() presigned %q, want HEAD", objects.presigned)
	}
	if _, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Thumbnail: true, Method: "GET"}); err != nil {
		t.Fatalf("GET Delivery() error = %v", err)
	}
	if objects.presigned != "GET" {
		t.Fatalf("GET Delivery() presigned %q, want GET", objects.presigned)
	}
	if _, err := library.Delivery(context.Background(), asset, MediaDeliveryOptions{Method: "GET", Download: true}); err != nil {
		t.Fatalf("download Delivery() error = %v", err)
	}
	if !strings.HasPrefix(objects.presigned, "DOWNLOAD:attachment") || !strings.Contains(objects.presigned, filepath.Base(asset.Path)) {
		t.Fatalf("download Delivery() presigned %q", objects.presigned)
	}
}

func TestMediaLibraryConcurrentRetryUploadsPendingAssetOnce(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	objects.failPut = true
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, _ := imageRelativePathFromValue(url)
	asset, _, _ := repo.LoadMediaAsset(rel)
	objects.mu.Lock()
	objects.failPut = false
	objects.putCalls = 0
	objects.mu.Unlock()

	errorsOut := make(chan error, 2)
	for range 2 {
		go func() { errorsOut <- library.uploadPending(context.Background(), asset) }()
	}
	for range 2 {
		if err := <-errorsOut; err != nil {
			t.Fatalf("uploadPending() error = %v", err)
		}
	}
	objects.mu.Lock()
	putCalls := objects.putCalls
	objects.mu.Unlock()
	if putCalls != 2 {
		t.Fatalf("PutFile calls = %d, want one original and one thumbnail upload", putCalls)
	}
	asset, _, err = repo.LoadMediaAsset(rel)
	if err != nil || asset.Status != mediaStatusReady {
		t.Fatalf("asset after concurrent retry = %#v err %v", asset, err)
	}
}

func TestMediaLibraryDeleteFailureKeepsDatabaseRecord(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaPNG(t), "", "user-1", "Alice", "png")
	if err != nil {
		t.Fatalf("StoreImage() error = %v", err)
	}
	rel, _ := imageRelativePathFromValue(url)
	uploadStoredMedia(t, library)
	asset, _, _ := repo.LoadMediaAsset(rel)
	objects.failDelete = asset.ObjectKey
	if _, err := library.DeleteImages([]string{rel}, ImageAccessScope{OwnerID: "user-1"}); err == nil {
		t.Fatal("DeleteImages() error = nil, want object deletion failure")
	}
	if _, ok, err := repo.LoadMediaAsset(rel); err != nil || !ok {
		t.Fatalf("database record was lost: ok %v err %v", ok, err)
	}
	data := objects.data[asset.ObjectKey]
	hash := sha256.Sum256(data)
	if hex.EncodeToString(hash[:]) != asset.SHA256 {
		t.Fatal("original object changed after failed delete")
	}
}

func TestMediaLibraryLegacyMigrationIsIdempotentAndPreservesMetadata(t *testing.T) {
	library, repo, _ := newMediaLibraryTestFixture(t)
	cfg := library.config.(mediaTestConfig)
	rel := "2026/08/14/legacy.png"
	imagePath := filepath.Join(cfg.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := storage.AtomicWriteFile(imagePath, mediaPNG(t), 0o600); err != nil {
		t.Fatalf("write legacy image: %v", err)
	}
	metaPath := filepath.Join(cfg.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		t.Fatalf("MkdirAll(metadata) error = %v", err)
	}
	meta := []byte(`{"owner_id":"user-1","owner_name":"Alice","visibility":"public","published_at":"2026-08-14T12:00:00+08:00","resolution_preset":"2k"}`)
	if err := storage.AtomicWriteFile(metaPath, meta, 0o600); err != nil {
		t.Fatalf("write metadata: %v", err)
	}

	library.TriggerLegacyImageMigration()
	status := waitForMediaMigration(t, library)
	if status.State != "succeeded" || status.Migrated != 1 || status.Failed != 0 {
		t.Fatalf("first migration = %#v", status)
	}
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok {
		t.Fatalf("LoadMediaAsset() = ok %v err %v", ok, err)
	}
	if asset.OwnerID != "user-1" || asset.Visibility != ImageVisibilityPublic || asset.ResolutionPreset != "2k" || asset.Status != mediaStatusReady {
		t.Fatalf("migrated asset = %#v", asset)
	}
	if _, err := os.Stat(imagePath); err != nil {
		t.Fatalf("legacy rollback file was removed: %v", err)
	}

	library.TriggerLegacyImageMigration()
	status = waitForMediaMigration(t, library)
	if status.Skipped != 1 || status.Migrated != 0 {
		t.Fatalf("second migration = %#v", status)
	}
}

func TestMediaLibraryLegacyMigrationQueuesUpstreamFailures(t *testing.T) {
	library, repo, objects := newMediaLibraryTestFixture(t)
	cfg := library.config.(mediaTestConfig)
	rel := "legacy.png"
	if err := os.MkdirAll(cfg.ImagesDir(), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := storage.AtomicWriteFile(filepath.Join(cfg.ImagesDir(), rel), mediaPNG(t), 0o600); err != nil {
		t.Fatalf("write legacy image: %v", err)
	}
	objects.failPut = true
	library.TriggerLegacyImageMigration()
	status := waitForMediaMigration(t, library)
	if status.State != "succeeded" || status.Pending != 1 || status.Migrated != 1 {
		t.Fatalf("migration status = %#v", status)
	}
	asset, ok, err := repo.LoadMediaAsset(rel)
	if err != nil || !ok || asset.Status != mediaStatusPending {
		t.Fatalf("pending asset = %#v ok %v err %v", asset, ok, err)
	}
}

func waitForMediaMigration(t *testing.T, library *MediaLibrary) MediaMigrationStatus {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		status := library.MigrationStatus()
		if status.State != "running" {
			return status
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("migration timed out: %#v", library.MigrationStatus())
	return MediaMigrationStatus{}
}
