package service

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func mediaAnimatedGIF(t *testing.T) []byte {
	t.Helper()
	palette := color.Palette{
		color.RGBA{R: 0, G: 0, B: 0, A: 255},
		color.RGBA{R: 255, G: 120, B: 0, A: 255},
		color.RGBA{R: 0, G: 200, B: 255, A: 255},
	}
	f1 := image.NewPaletted(image.Rect(0, 0, 8, 6), palette)
	f1.SetColorIndex(0, 0, 1)
	f2 := image.NewPaletted(image.Rect(0, 0, 8, 6), palette)
	f2.SetColorIndex(2, 2, 2)
	var out bytes.Buffer
	if err := gif.EncodeAll(&out, &gif.GIF{Image: []*image.Paletted{f1, f2}, Delay: []int{6, 6}}); err != nil {
		t.Fatalf("gif.EncodeAll() error = %v", err)
	}
	return out.Bytes()
}

func TestMediaLibraryStoreGIFSkipsStaticThumbnail(t *testing.T) {
	library, repo, _ := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaAnimatedGIF(t), "https://cdn.example.test", "user-1", "Alice", "gif")
	if err != nil {
		t.Fatalf("StoreImage(gif) error = %v", err)
	}
	if !strings.HasSuffix(url, ".gif") {
		t.Fatalf("StoreImage(gif) url = %q, want .gif suffix", url)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	uploadStoredMedia(t, library)
	asset := waitForMediaStatus(t, repo, rel, mediaStatusReady)
	if asset.OutputFormat != "gif" {
		t.Fatalf("asset.OutputFormat = %q, want gif", asset.OutputFormat)
	}
	if asset.ThumbnailKey != "" {
		t.Fatalf("asset.ThumbnailKey = %q, want empty so gallery animates raw GIF", asset.ThumbnailKey)
	}
	if asset.Width != 8 || asset.Height != 6 {
		t.Fatalf("asset dimensions = %dx%d, want 8x6", asset.Width, asset.Height)
	}
	page, err := library.ListImages("https://cdn.example.test", ImageListQuery{Scope: ImageAccessScope{OwnerID: "user-1"}, Limit: 20})
	if err != nil {
		t.Fatalf("ListImages() error = %v", err)
	}
	items, _ := page["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", page["items"])
	}
	if thumbURL, _ := items[0]["thumbnail_url"].(string); thumbURL != "" {
		t.Fatalf("thumbnail_url = %q, want empty for animated GIF", thumbURL)
	}
}

func TestMediaLibraryUpdateAndVisibilityPreserveGIFFormat(t *testing.T) {
	library, repo, _ := newMediaLibraryTestFixture(t)
	url, err := library.StoreImage(mediaAnimatedGIF(t), "https://cdn.example.test", "user-1", "Alice", "gif")
	if err != nil {
		t.Fatalf("StoreImage(gif) error = %v", err)
	}
	rel, err := imageRelativePathFromValue(url)
	if err != nil {
		t.Fatalf("imageRelativePathFromValue() error = %v", err)
	}
	uploadStoredMedia(t, library)
	_ = waitForMediaStatus(t, repo, rel, mediaStatusReady)

	// Simulate /v1/images/* recordGeneratedImages with empty GeneratedImageMetadata{}
	if err := library.UpdateGeneratedImage(url, "user-1", "Alice", ImageVisibilityPrivate, GeneratedImageMetadata{}); err != nil {
		t.Fatalf("UpdateGeneratedImage() error = %v", err)
	}
	assetAfterRecord := waitForMediaStatus(t, repo, rel, mediaStatusReady)
	if assetAfterRecord.OutputFormat != "gif" {
		t.Fatalf("after empty UpdateGeneratedImage OutputFormat = %q, want gif", assetAfterRecord.OutputFormat)
	}

	// Simulate PATCH /api/images/visibility
	pubItem, err := library.UpdateImageVisibility(url, ImageVisibilityPublic, ImageAccessScope{OwnerID: "user-1"})
	if err != nil {
		t.Fatalf("UpdateImageVisibility(public) error = %v", err)
	}
	if pubItem["output_format"] != "gif" {
		t.Fatalf("UpdateImageVisibility item output_format = %#v, want gif", pubItem["output_format"])
	}
	assetAfterVis := waitForMediaStatus(t, repo, rel, mediaStatusReady)
	if assetAfterVis.OutputFormat != "gif" {
		t.Fatalf("after UpdateImageVisibility OutputFormat = %q, want gif", assetAfterVis.OutputFormat)
	}
}

type localDiskImageTestConfig struct {
	root string
}

func (c localDiskImageTestConfig) ImagesDir() string          { return filepath.Join(c.root, "images") }
func (c localDiskImageTestConfig) ImageThumbnailsDir() string { return filepath.Join(c.root, "thumbs") }
func (c localDiskImageTestConfig) ImageMetadataDir() string   { return filepath.Join(c.root, "meta") }
func (c localDiskImageTestConfig) CleanupOldImages() int      { return 0 }

func TestLocalDiskImageServicePreservesGIFMetadataAndSkipsThumbnail(t *testing.T) {
	cfg := localDiskImageTestConfig{root: t.TempDir()}
	svc := NewImageService(cfg)
	rel := "2026/11/14/anim.gif"
	fullPath := filepath.Join(cfg.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fullPath, mediaAnimatedGIF(t), 0o644); err != nil {
		t.Fatal(err)
	}
	imageURL := "https://example.test/images/" + rel
	if err := svc.RecordGeneratedImages([]string{imageURL}, "user-1", "Alice", ImageVisibilityPrivate, GeneratedImageMetadata{}); err != nil {
		t.Fatalf("RecordGeneratedImages() error = %v", err)
	}
	if entries, err := os.ReadDir(cfg.ImageThumbnailsDir()); err == nil && len(entries) > 0 {
		t.Fatalf("expected no thumbnails generated for .gif, found %d entries", len(entries))
	}
	updated, err := svc.UpdateImageVisibility(imageURL, ImageVisibilityPublic, ImageAccessScope{OwnerID: "user-1"})
	if err != nil {
		t.Fatalf("UpdateImageVisibility() error = %v", err)
	}
	if updated["output_format"] != "gif" {
		t.Fatalf("local UpdateImageVisibility output_format = %#v, want gif", updated["output_format"])
	}
	if updated["thumbnail_url"] != "" {
		t.Fatalf("local UpdateImageVisibility thumbnail_url = %#v, want empty", updated["thumbnail_url"])
	}
	if updated["url"] != "/images/"+rel {
		t.Fatalf("local UpdateImageVisibility url = %#v, want /images/%s", updated["url"], rel)
	}
}

func TestImageChannelUpgrades26GIFFormatsAndResolvesEnabledCustomUpstream(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	if err := backend.SaveJSONDocument(imageChannelsDocumentName, map[string]any{
		"version": 1,
		"channels": []map[string]any{
			{
				"id": "local-account-pool", "name": "本地号池", "alias": "渠道 1",
				"type": "account_pool", "enabled": true, "system": true, "sort": 10, "max_concurrency": 3,
			},
		},
		"models": []map[string]any{
			{
				"id": "local-gpt-image-2-6-flare", "channel_id": "local-account-pool",
				"display_name": util.ImageModelGPT26Flare, "upstream_model": util.ImageModelGPT26Flare,
				"capabilities": []string{"generate", "edit"}, "resolutions": []string{"1k"},
				"formats": []string{"png", "jpeg", "webp"}, "credit_cost": 5, "enabled": true, "sort": 10,
			},
		},
	}); err != nil {
		t.Fatal(err)
	}
	svc, err := NewImageChannelService(dir, backend, ImageChannelLegacyConfig{})
	if err != nil {
		t.Fatalf("NewImageChannelService() error = %v", err)
	}
	upgraded, err := svc.ResolveModel("local-gpt-image-2-6-flare")
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if !slices.Contains(upgraded.Formats, "gif") {
		t.Fatalf("expected startup sync to upgrade legacy 2.6 formats with gif, got %#v", upgraded.Formats)
	}

	relayCh, err := svc.CreateChannel(ImageChannelInput{
		Name: "Flux Relay", Type: ImageChannelTypeOpenAICompatible, BaseURL: "https://relay.example.test", APIKey: "sk-relay", Enabled: true, Sort: 20, MaxConcurrency: 4, TimeoutSeconds: 30,
	})
	if err != nil {
		t.Fatalf("CreateChannel() error = %v", err)
	}
	createdModel, err := svc.CreateModel(relayCh.ID, ImageChannelModelInput{
		DisplayName: "Flux Pro", UpstreamModel: "flux-pro", Capabilities: []string{"generate"}, CreditCost: 7, Enabled: true, Sort: 10,
	})
	if err != nil {
		t.Fatalf("CreateModel() error = %v", err)
	}
	resolvedCustom, found, err := svc.ResolveEnabledModelByUpstream("flux-pro", "generate")
	if err != nil || !found || resolvedCustom.ID != createdModel.ID || resolvedCustom.CreditCost != 7 {
		t.Fatalf("ResolveEnabledModelByUpstream(flux-pro) = %#v, found=%v, err=%v", resolvedCustom, found, err)
	}
}
