package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestVideoAssetServiceScopesVisibilityAndDelete(t *testing.T) {
	root := t.TempDir()
	service := NewVideoAssetService(root)
	alice := writeVideoAssetFixture(t, service, VideoAsset{TaskID: "shared", OwnerID: "alice", OwnerName: "Alice", CreatedAt: "2026-08-12T10:00:00Z"})
	bob := writeVideoAssetFixture(t, service, VideoAsset{TaskID: "shared", OwnerID: "bob", OwnerName: "Bob", CreatedAt: "2026-08-12T11:00:00Z"})
	if alice.ID == bob.ID {
		t.Fatal("same task id across owners must have distinct asset ids")
	}

	mine := service.List(VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine})
	if len(mine) != 1 || mine[0].ID != alice.ID {
		t.Fatalf("alice list = %#v", mine)
	}
	if public := service.List(VideoAssetScope{Kind: VideoAssetScopePublic}); len(public) != 0 {
		t.Fatalf("private videos leaked into public list: %#v", public)
	}
	updated, err := service.UpdateVisibility(alice.ID, VideoAssetVisibilityPublic, VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine})
	if err != nil || updated.Visibility != VideoAssetVisibilityPublic {
		t.Fatalf("update visibility = %#v, %v", updated, err)
	}
	public := service.List(VideoAssetScope{Kind: VideoAssetScopePublic})
	if len(public) != 1 || public[0].ID != alice.ID {
		t.Fatalf("public list = %#v", public)
	}
	if _, err := service.UpdateVisibility(bob.ID, VideoAssetVisibilityPublic, VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine}); !os.IsNotExist(err) {
		t.Fatalf("cross-owner visibility error = %v", err)
	}
	if deleted, err := service.Delete(bob.ID, VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine}); err != nil || deleted {
		t.Fatalf("cross-owner delete = %v, %v", deleted, err)
	}
	if deleted, err := service.Delete(bob.ID, VideoAssetScope{Kind: VideoAssetScopeAll}); err != nil || !deleted {
		t.Fatalf("admin delete = %v, %v", deleted, err)
	}
}

func TestVideoAssetServiceFindAccessibleHonorsVisibility(t *testing.T) {
	service := NewVideoAssetService(t.TempDir())
	asset := writeVideoAssetFixture(t, service, VideoAsset{TaskID: "alice-video", OwnerID: "alice"})

	if _, ok := service.FindAccessible(asset.ID, "bob", false); ok {
		t.Fatal("another owner must not read a private video")
	}
	if item, ok := service.FindAccessible(asset.TaskID, "alice", false); !ok || item.ID != asset.ID {
		t.Fatalf("legacy owner task reference = %#v, %v", item, ok)
	}
	if _, err := service.UpdateVisibility(asset.ID, VideoAssetVisibilityPublic, VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine}); err != nil {
		t.Fatal(err)
	}
	if item, ok := service.FindAccessible(asset.ID, "bob", false); !ok || item.OwnerID != "alice" {
		t.Fatalf("public find = %#v, %v", item, ok)
	}
	if item, ok := service.FindAccessible(asset.TaskID, "bob", false); !ok || item.ID != asset.ID {
		t.Fatalf("legacy public task reference = %#v, %v", item, ok)
	}
}

func TestVideoAssetServiceBackfillExistingVideo(t *testing.T) {
	root := t.TempDir()
	service := NewVideoAssetService(root)
	seed := VideoAsset{TaskID: "legacy-video", OwnerID: "alice", OwnerName: "Alice", CreatedAt: "2026-08-11T10:00:00Z"}
	path := service.ContentPath(seed.OwnerID, seed.TaskID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("legacy-video"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := service.Backfill([]VideoAsset{seed, {TaskID: "missing", OwnerID: "bob"}}); err != nil {
		t.Fatal(err)
	}

	items := service.List(VideoAssetScope{Kind: VideoAssetScopeAll})
	if len(items) != 1 || items[0].TaskID != seed.TaskID || items[0].Visibility != VideoAssetVisibilityPrivate {
		t.Fatalf("backfilled items = %#v", items)
	}
	reloaded := NewVideoAssetService(root)
	if item, ok := reloaded.Find(items[0].ID, VideoAssetScope{OwnerID: "alice", Kind: VideoAssetScopeMine}); !ok || item.ContentType != "video/mp4" {
		t.Fatalf("reloaded asset = %#v, %v", item, ok)
	}
}

func writeVideoAssetFixture(t *testing.T, service *VideoAssetService, item VideoAsset) VideoAsset {
	t.Helper()
	path := service.ContentPath(item.OwnerID, item.TaskID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}
	recorded, err := service.Record(item)
	if err != nil {
		t.Fatal(err)
	}
	return recorded
}
