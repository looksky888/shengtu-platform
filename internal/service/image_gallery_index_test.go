package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestImageGalleryIndexPaginationAndIncremental(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	svc := NewImageService(config)

	// Create 5 images under the same day with distinct paths.
	for i := 0; i < 5; i++ {
		rel := filepath.ToSlash(filepath.Join("2026", "07", "15", "img-"+itoa(i)+".png"))
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatal(err)
		}
		svc.RecordGeneratedImages([]string{rel}, "user-1", "User", ImageVisibilityPrivate)
	}

	// Force complete rebuild so index includes all files even if upserts raced.
	if err := svc.RebuildGalleryIndex(); err != nil {
		t.Fatalf("RebuildGalleryIndex: %v", err)
	}

	page1 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{
		Scope: ImageAccessScope{OwnerID: "user-1"},
		Limit: 2,
	})
	items1 := page1["items"].([]map[string]any)
	if len(items1) != 2 {
		t.Fatalf("page1 len = %d, want 2; %#v", len(items1), page1)
	}
	if !toBool(page1["has_more"]) {
		t.Fatal("page1 has_more = false")
	}
	cursor, _ := page1["next_cursor"].(string)
	if cursor == "" {
		t.Fatal("missing next_cursor")
	}

	page2 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{
		Scope:  ImageAccessScope{OwnerID: "user-1"},
		Limit:  2,
		Cursor: cursor,
	})
	items2 := page2["items"].([]map[string]any)
	if len(items2) != 2 {
		t.Fatalf("page2 len = %d", len(items2))
	}
	// No overlap between pages.
	paths := map[string]struct{}{}
	for _, item := range items1 {
		paths[toString(item["path"])] = struct{}{}
	}
	for _, item := range items2 {
		if _, ok := paths[toString(item["path"])]; ok {
			t.Fatalf("duplicate path across pages: %s", item["path"])
		}
	}

	// Incremental: updated_after far future → empty.
	delta := mustListImagesQuery(t, svc, "http://x", ImageListQuery{
		Scope:        ImageAccessScope{All: true},
		Limit:        10,
		UpdatedAfter: "2099-01-01 00:00:00",
	})
	if len(delta["items"].([]map[string]any)) != 0 {
		t.Fatalf("updated_after future should be empty: %#v", delta)
	}
}

func TestImageGalleryKeysetCursorSurvivesInsertBeforeCursor(t *testing.T) {
	svc, config, paths := buildIndexedGallery(t, 5)
	page1 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{Scope: allImages, Limit: 2})
	cursor := page1["next_cursor"].(string)

	newPath := filepath.ToSlash(filepath.Join("2026", "07", "15", "newest.png"))
	absolutePath := filepath.Join(config.ImagesDir(), filepath.FromSlash(newPath))
	if err := writeTestPNG(absolutePath); err != nil {
		t.Fatalf("write inserted image: %v", err)
	}
	newest := time.Date(2026, 7, 15, 13, 0, 0, 0, time.Local)
	if err := os.Chtimes(absolutePath, newest, newest); err != nil {
		t.Fatalf("set inserted image time: %v", err)
	}
	if err := svc.RecordGeneratedImages([]string{newPath}, "user-1", "User", ImageVisibilityPrivate); err != nil {
		t.Fatalf("record inserted image: %v", err)
	}

	page2 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{Scope: allImages, Limit: 2, Cursor: cursor})
	assertImagePaths(t, page2, paths[2], paths[3])
}

func TestImageGalleryKeysetCursorSurvivesDeleteBeforeCursor(t *testing.T) {
	svc, _, paths := buildIndexedGallery(t, 5)
	page1 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{Scope: allImages, Limit: 2})
	cursor := page1["next_cursor"].(string)
	if _, err := svc.DeleteImages([]string{paths[0]}, allImages); err != nil {
		t.Fatalf("delete image before cursor: %v", err)
	}

	page2 := mustListImagesQuery(t, svc, "http://x", ImageListQuery{Scope: allImages, Limit: 2, Cursor: cursor})
	assertImagePaths(t, page2, paths[2], paths[3])
}

func TestImageGallerySaveFailureMarksIndexIncomplete(t *testing.T) {
	config := testImageConfig{root: t.TempDir()}
	path := filepath.Join(config.ImagesDir(), "2026", "07", "15", "sample.png")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatal(err)
	}
	store := &imageIndexTestStore{}
	svc := NewImageService(config)
	svc.store = store
	if err := svc.RebuildGalleryIndex(); err != nil {
		t.Fatalf("initial rebuild: %v", err)
	}
	mustListImagesQuery(t, svc, "http://x", ImageListQuery{Scope: allImages, Limit: 10})
	if svc.galleryPrivateOrder == nil {
		t.Fatal("private order cache was not populated")
	}

	store.saveErr = errors.New("disk full")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	err = svc.upsertGalleryIndexEntry(filepath.ToSlash(filepath.Join("2026", "07", "15", "sample.png")), info)
	if !errors.Is(err, ErrImageGalleryIndexPersistence) {
		t.Fatalf("upsert error = %v", err)
	}
	if svc.galleryIndex.Complete {
		t.Fatal("index remained complete after save failure")
	}
	if svc.galleryPrivateOrder != nil || svc.galleryPublicOrder != nil {
		t.Fatal("sorted order cache was not invalidated")
	}

	store.saveErr = nil
	if _, err := svc.ListImagesQuery("http://x", ImageListQuery{Scope: allImages, Limit: 10}); err != nil {
		t.Fatalf("list after storage recovery: %v", err)
	}
	if !svc.galleryIndex.Complete {
		t.Fatal("index did not rebuild after storage recovery")
	}
}

func buildIndexedGallery(t *testing.T, count int) (*ImageService, testImageConfig, []string) {
	t.Helper()
	config := testImageConfig{root: t.TempDir()}
	svc := NewImageService(config)
	paths := make([]string, 0, count)
	stamp := time.Date(2026, 7, 15, 12, 0, 0, 0, time.Local)
	for index := 0; index < count; index++ {
		relativePath := filepath.ToSlash(filepath.Join("2026", "07", "15", "img-"+itoa(index)+".png"))
		absolutePath := filepath.Join(config.ImagesDir(), filepath.FromSlash(relativePath))
		if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := writeTestPNG(absolutePath); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(absolutePath, stamp, stamp); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, relativePath)
	}
	if err := svc.RebuildGalleryIndex(); err != nil {
		t.Fatalf("rebuild gallery: %v", err)
	}
	return svc, config, paths
}

func assertImagePaths(t *testing.T, payload map[string]any, want ...string) {
	t.Helper()
	items := payload["items"].([]map[string]any)
	if len(items) != len(want) {
		t.Fatalf("image count = %d, want %d: %#v", len(items), len(want), items)
	}
	for index, path := range want {
		if got := toString(items[index]["path"]); got != path {
			t.Fatalf("image %d path = %q, want %q", index, got, path)
		}
	}
}

type imageIndexTestStore struct {
	saveErr error
}

func (s *imageIndexTestStore) LoadJSONDocument(string) (any, error) {
	return nil, nil
}

func (s *imageIndexTestStore) SaveJSONDocument(string, any) error {
	return s.saveErr
}

func (s *imageIndexTestStore) DeleteJSONDocument(string) error {
	return nil
}

func toBool(v any) bool {
	b, _ := v.(bool)
	return b
}
