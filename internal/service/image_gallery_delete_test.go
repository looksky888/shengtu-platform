package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// A single failing item must not stop the remaining deletions nor leave the
// gallery index listing files that were already removed.
func TestImageServiceDeleteImagesContinuesAfterItemFailure(t *testing.T) {
	config := testImageConfig{root: t.TempDir()}
	service := NewImageService(config)
	brokenRel := "2026/07/15/broken.png"
	goodRel := "2026/07/15/good.png"
	// A directory on an image path fails the item after validation passed.
	if err := os.MkdirAll(filepath.Join(config.ImagesDir(), filepath.FromSlash(brokenRel)), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	goodPath := filepath.Join(config.ImagesDir(), filepath.FromSlash(goodRel))
	if err := writeTestPNG(goodPath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	if err := service.RebuildGalleryIndex(); err != nil {
		t.Fatalf("RebuildGalleryIndex() error = %v", err)
	}

	result, err := service.DeleteImages([]string{brokenRel, goodRel}, allImages)
	if err == nil {
		t.Fatal("DeleteImages() error = nil, want the failing item reported")
	}
	if result != nil {
		t.Fatalf("DeleteImages() = %#v, want nil payload on failure", result)
	}
	if _, statErr := os.Stat(goodPath); !os.IsNotExist(statErr) {
		t.Fatalf("later image survived the batch, stat error = %v", statErr)
	}
	page := mustListImagesQuery(t, service, "http://x", ImageListQuery{Scope: allImages, Limit: 10})
	assertImagePaths(t, page)
}

// A stale index row (file removed out of band) must be dropped instead of
// keeping a broken entry in the gallery.
func TestImageServiceDeleteImagesDropsStaleIndexRowForMissingFile(t *testing.T) {
	config := testImageConfig{root: t.TempDir()}
	service := NewImageService(config)
	rel := "2026/07/15/gone.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	if err := service.RecordGeneratedImages([]string{rel}, "user-1", "User", ImageVisibilityPrivate); err != nil {
		t.Fatalf("RecordGeneratedImages() error = %v", err)
	}
	if err := service.RebuildGalleryIndex(); err != nil {
		t.Fatalf("RebuildGalleryIndex() error = %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}

	result, err := service.DeleteImages([]string{rel}, ImageAccessScope{OwnerID: "user-1"})
	if err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if result["deleted"] != 0 || result["missing"] != 1 {
		t.Fatalf("DeleteImages() = %#v, want deleted 0 missing 1", result)
	}
	service.indexMu().Lock()
	_, stillIndexed := service.galleryIndex.Entries[rel]
	service.indexMu().Unlock()
	if stillIndexed {
		t.Fatal("stale gallery index row survived the delete")
	}
}

// When the index row cannot be dropped the file stays: the UI must never lose
// the row while the bytes are still deleted underneath it.
func TestImageServiceDeleteImagesKeepsFileWhenIndexRowCannotBeDropped(t *testing.T) {
	service, config, paths := buildIndexedGallery(t, 1)
	service.store = &imageIndexTestStore{saveErr: errors.New("disk full")}

	if _, err := service.DeleteImages([]string{paths[0]}, allImages); !errors.Is(err, ErrImageGalleryIndexPersistence) {
		t.Fatalf("DeleteImages() error = %v, want %v", err, ErrImageGalleryIndexPersistence)
	}
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(paths[0]))
	if _, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("file was deleted although its index row survived: %v", statErr)
	}
}
