package service

import (
	"encoding/json"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type testImageConfig struct {
	root string
}

func (c testImageConfig) ImagesDir() string {
	path := filepath.Join(c.root, "images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImageThumbnailsDir() string {
	path := filepath.Join(c.root, "image_thumbnails")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImageMetadataDir() string {
	path := filepath.Join(c.root, "image_metadata")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) CleanupOldImages() int {
	return 0
}

var allImages = ImageAccessScope{All: true}

func mustListImages(t *testing.T, service *ImageService, baseURL, startDate, endDate string, scope ImageAccessScope) map[string]any {
	t.Helper()
	result, err := service.ListImages(baseURL, startDate, endDate, scope)
	if err != nil {
		t.Fatalf("ListImages() error = %v", err)
	}
	return result
}

func mustListImagesQuery(t *testing.T, service *ImageService, baseURL string, query ImageListQuery) map[string]any {
	t.Helper()
	result, err := service.ListImagesQuery(baseURL, query)
	if err != nil {
		t.Fatalf("ListImagesQuery() error = %v", err)
	}
	return result
}

func TestImageServiceListImagesReturnsEmptyArrays(t *testing.T) {
	service := NewImageService(testImageConfig{root: t.TempDir()})
	result := mustListImages(t, service, "http://127.0.0.1:8000", "", "", allImages)

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if string(data) != `{"groups":[],"has_more":false,"items":[],"limit":100,"next_cursor":"","total":0}` {
		t.Fatalf("ListImages() JSON = %s", data)
	}
}

func TestImageServiceListImagesReturnsDimensionsWithoutGeneratingThumbnails(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	result := mustListImages(t, service, "http://127.0.0.1:8000", "", "", allImages)
	items := result["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if got := toString(items[0]["path"]); got != "2026/04/29/sample.png" {
		t.Fatalf("path = %q, want relative image path", got)
	}
	thumbnailURL := toString(items[0]["thumbnail_url"])
	thumbnailPath := requireThumbnailURLPath(t, thumbnailURL)
	if !strings.HasSuffix(thumbnailPath, thumbnailExtension) {
		t.Fatalf("thumbnail_url path = %q, want %s suffix", thumbnailPath, thumbnailExtension)
	}
	if numericMetaValue(items[0]["width"]) != 32 || numericMetaValue(items[0]["height"]) != 24 {
		t.Fatalf("ListImages() dimensions = %#v, want 32x24", items[0])
	}
	if toString(items[0]["resolution"]) != "32x24" {
		t.Fatalf("ListImages() resolution = %#v, want 32x24", items[0]["resolution"])
	}
	if toString(items[0]["aspect_ratio"]) != "4:3" {
		t.Fatalf("ListImages() aspect_ratio = %#v, want 4:3", items[0]["aspect_ratio"])
	}
	if toString(items[0]["orientation"]) != "landscape" {
		t.Fatalf("ListImages() orientation = %#v, want landscape", items[0]["orientation"])
	}
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("ListImages() should not create thumbnail synchronously, stat error = %v", err)
	}
}

func TestImageServiceEnsureThumbnailCreatesJPEGThumbnails(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbnailRel := "2026/04/29/sample.png" + thumbnailExtension
	if !strings.HasSuffix(thumbnailRel, thumbnailExtension) {
		t.Fatalf("thumbnail_rel = %q, want %s suffix", thumbnailRel, thumbnailExtension)
	}

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), filepath.FromSlash(thumbnailRel))
	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		t.Fatalf("decode jpeg thumbnail: %v", err)
	}
	if decoded.Bounds().Dx() <= 0 || decoded.Bounds().Dy() <= 0 {
		t.Fatalf("decoded thumbnail has invalid bounds: %v", decoded.Bounds())
	}
	if decoded.Bounds().Dx() > ThumbnailSize || decoded.Bounds().Dy() > ThumbnailSize {
		t.Fatalf("decoded thumbnail bounds = %v, want max side <= %d", decoded.Bounds(), ThumbnailSize)
	}
	meta, err := os.ReadFile(thumbPath + ".json")
	if err != nil {
		t.Fatalf("read thumbnail metadata: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(meta, &metadata); err != nil {
		t.Fatalf("unmarshal thumbnail metadata: %v", err)
	}
	if numericMetaValue(metadata["thumbnail_size"]) != ThumbnailSize {
		t.Fatalf("thumbnail_size metadata = %v, want %d", metadata["thumbnail_size"], ThumbnailSize)
	}
	if numericMetaValue(metadata["thumbnail_quality"]) != thumbnailQuality {
		t.Fatalf("thumbnail_quality metadata = %v, want %d", metadata["thumbnail_quality"], thumbnailQuality)
	}
}

func TestImageServiceEnsureThumbnailsKeepsLargeImageThumbnailSmall(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "large.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeLargeTestPNG(imagePath); err != nil {
		t.Fatalf("writeLargeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/large.png"})

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "large.png"+thumbnailExtension)
	info, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail: %v", err)
	}
	if info.Size() > 120*1024 {
		t.Fatalf("thumbnail size = %d bytes, want <= 120KiB", info.Size())
	}

	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		t.Fatalf("decode jpeg thumbnail: %v", err)
	}
	if decoded.Bounds().Dx() > ThumbnailSize || decoded.Bounds().Dy() > ThumbnailSize {
		t.Fatalf("decoded thumbnail bounds = %v, want max side <= %d", decoded.Bounds(), ThumbnailSize)
	}
}

func TestImageServiceEnsureThumbnailsCreatesCachedThumbnailFromImageURL(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"http://127.0.0.1:8000/images/2026/04/29/sample.png"})

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}
	if _, err := os.Stat(thumbPath + ".json"); err != nil {
		t.Fatalf("thumbnail metadata was not created: %v", err)
	}

	result := mustListImages(t, service, "http://127.0.0.1:8000", "", "", allImages)
	items := result["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0]["width"] == nil || items[0]["height"] == nil {
		t.Fatalf("ListImages() did not read warmed thumbnail metadata: %#v", items[0])
	}
}

func TestImageServiceEnsureThumbnailsReusesFreshThumbnail(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	firstInfo, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail: %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	secondInfo, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail after reuse: %v", err)
	}
	if !secondInfo.ModTime().Equal(firstInfo.ModTime()) {
		t.Fatalf("fresh thumbnail was regenerated: first=%s second=%s", firstInfo.ModTime(), secondInfo.ModTime())
	}
}

func TestImageServiceEnsureThumbnailsRegeneratesStaleThumbnail(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	staleTime := time.Now().Add(-time.Hour).Truncate(time.Second)
	if err := os.Chtimes(thumbPath, staleTime, staleTime); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	info, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat regenerated thumbnail: %v", err)
	}
	if !info.ModTime().After(staleTime) {
		t.Fatalf("stale thumbnail was not regenerated: got %s, stale %s", info.ModTime(), staleTime)
	}
}

func TestImageServiceEnsureThumbnailsRefreshesInvalidMetadata(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if err := os.WriteFile(thumbPath+".json", []byte(`{"width":1,"height":1,"thumbnail_size":1,"thumbnail_version":0}`), 0o644); err != nil {
		t.Fatalf("write stale metadata: %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	meta, err := os.ReadFile(thumbPath + ".json")
	if err != nil {
		t.Fatalf("read thumbnail metadata: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(meta, &metadata); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	if numericMetaValue(metadata["thumbnail_size"]) != ThumbnailSize || numericMetaValue(metadata["thumbnail_version"]) != thumbnailCacheVersion || numericMetaValue(metadata["thumbnail_quality"]) != thumbnailQuality {
		t.Fatalf("metadata was not refreshed: %#v", metadata)
	}
}

func TestImageServiceEnsureThumbnailsHandlesConcurrentSameImage(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
		}()
	}
	wg.Wait()

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	if _, err := jpeg.Decode(file); err != nil {
		t.Fatalf("decode concurrent thumbnail: %v", err)
	}
}
