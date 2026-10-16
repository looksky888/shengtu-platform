package service

import (
	"image"
	"image/color"
	"image/png"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImageServiceDeleteImagesRemovesOriginalAndThumbnail(t *testing.T) {
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
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}

	result, err := service.DeleteImages([]string{"2026/04/29/sample.png"}, allImages)
	if err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if result["deleted"] != 1 || result["missing"] != 0 {
		t.Fatalf("DeleteImages() = %#v", result)
	}
	if _, err := os.Stat(imagePath); !os.IsNotExist(err) {
		t.Fatalf("original still exists, stat error = %v", err)
	}
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("thumbnail still exists, stat error = %v", err)
	}
	if _, err := os.Stat(thumbPath + ".json"); !os.IsNotExist(err) {
		t.Fatalf("thumbnail metadata still exists, stat error = %v", err)
	}
}

func TestImageServiceScopesImagesByOwner(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	alicePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "alice.png")
	bobPath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "bob.png")
	legacyPath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "legacy.png")
	for _, path := range []string{alicePath, bobPath, legacyPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", path, err)
		}
	}

	service := NewImageService(config)
	service.RecordImageOwners([]string{"2026/04/29/alice.png"}, "linuxdo:123")
	service.RecordImageOwners([]string{"http://127.0.0.1:8000/images/2026/04/29/bob.png"}, "linuxdo:456")

	alice := mustListImages(t, service, "http://127.0.0.1:8000", "", "", ImageAccessScope{OwnerID: "linuxdo:123"})
	aliceItems := alice["items"].([]map[string]any)
	if len(aliceItems) != 1 || aliceItems[0]["path"] != "2026/04/29/alice.png" {
		t.Fatalf("alice ListImages() = %#v", alice)
	}
	admin := mustListImages(t, service, "http://127.0.0.1:8000", "", "", allImages)
	if items := admin["items"].([]map[string]any); len(items) != 3 {
		t.Fatalf("admin ListImages() = %#v", admin)
	}

	result, err := service.DeleteImages([]string{"2026/04/29/bob.png", "2026/04/29/alice.png"}, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("DeleteImages(owner) error = %v", err)
	}
	if result["deleted"] != 1 || result["missing"] != 1 {
		t.Fatalf("DeleteImages(owner) = %#v", result)
	}
	if _, err := os.Stat(alicePath); !os.IsNotExist(err) {
		t.Fatalf("alice image still exists, stat error = %v", err)
	}
	if _, err := os.Stat(bobPath); err != nil {
		t.Fatalf("bob image should not be deleted, stat error = %v", err)
	}
}

func TestImageServicePublicVisibility(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	aliceRel := "2026/04/29/alice.png"
	bobRel := "2026/04/29/bob.png"
	for _, rel := range []string{aliceRel, bobRel} {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", path, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{aliceRel}, "linuxdo:123", "alice", ImageVisibilityPublic)
	service.RecordGeneratedImages([]string{bobRel}, "linuxdo:456", "bob", ImageVisibilityPrivate)

	public := mustListImages(t, service, "http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	publicItems := public["items"].([]map[string]any)
	if len(publicItems) != 1 || publicItems[0]["path"] != aliceRel {
		t.Fatalf("public ListImages() = %#v", public)
	}
	if publicItems[0]["visibility"] != ImageVisibilityPublic || publicItems[0]["owner_name"] != "alice" || publicItems[0]["published_at"] == "" {
		t.Fatalf("public metadata = %#v", publicItems[0])
	}

	if _, err := service.UpdateImageVisibility(aliceRel, ImageVisibilityPrivate, ImageAccessScope{OwnerID: "linuxdo:456"}); err == nil {
		t.Fatal("UpdateImageVisibility(other owner) error = nil")
	}
	if _, err := service.UpdateImageVisibility("http://127.0.0.1:8000/images/"+aliceRel, ImageVisibilityPrivate, ImageAccessScope{OwnerID: "linuxdo:123"}); err != nil {
		t.Fatalf("UpdateImageVisibility(owner private) error = %v", err)
	}
	public = mustListImages(t, service, "http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	if items := public["items"].([]map[string]any); len(items) != 0 {
		t.Fatalf("private image should leave public gallery: %#v", public)
	}
}

func TestImageServiceListImagesReturnsRequestedResolutionPreset(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/alice.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPrivate, GeneratedImageMetadata{
		ResolutionPreset: "2k",
		RequestedSize:    "2048x2048",
	})

	list := mustListImages(t, service, "http://127.0.0.1:8000", "", "", allImages)
	items := list["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("ListImages() = %#v", list)
	}
	if items[0]["resolution_preset"] != "2k" || items[0]["requested_size"] != "2048x2048" {
		t.Fatalf("request metadata = %#v", items[0])
	}
	if items[0]["resolution"] != "32x24" {
		t.Fatalf("actual resolution = %#v, want 32x24", items[0]["resolution"])
	}
}

func TestImageServiceDeleteImagesRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	outsidePath := filepath.Join(root, "outside.png")
	if err := writeTestPNG(outsidePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(testImageConfig{root: root})
	if _, err := service.DeleteImages([]string{"../outside.png"}, allImages); err == nil {
		t.Fatal("DeleteImages() error = nil, want traversal rejection")
	}
	if _, err := os.Stat(outsidePath); err != nil {
		t.Fatalf("outside file was changed: %v", err)
	}
}

func requireThumbnailURLPath(t *testing.T, value string) string {
	t.Helper()
	parsed, err := url.Parse(value)
	if err != nil {
		t.Fatalf("parse thumbnail_url: %v", err)
	}
	if !strings.Contains(parsed.Path, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url path = %q, want image thumbnail route", parsed.Path)
	}
	if parsed.Query().Get("v") == "" {
		t.Fatalf("thumbnail_url = %q, want cache-busting version query", value)
	}
	return parsed.Path
}

func writeTestPNG(path string) error {
	img := image.NewRGBA(image.Rect(0, 0, 32, 24))
	for y := 0; y < 24; y++ {
		for x := 0; x < 32; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 10), B: 120, A: 255})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return png.Encode(file, img)
}

func writeLargeTestPNG(path string) error {
	img := image.NewRGBA(image.Rect(0, 0, 1600, 1200))
	for y := 0; y < 1200; y++ {
		for x := 0; x < 1600; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8((x*37 + y*17) & 0xff),
				G: uint8((x*13 ^ y*31) & 0xff),
				B: uint8((x*y + x*11 + y*7) & 0xff),
				A: 255,
			})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return png.Encode(file, img)
}
