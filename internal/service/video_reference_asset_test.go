package service

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestVideoReferenceAssetServicePersistsAndScopesOwners(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	service := NewVideoReferenceAssetService(dir, backend)
	asset, err := service.New("user:alice", "portrait.png", "image/png", []byte("png-bytes"))
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if got := service.List("user:alice"); len(got) != 1 || got[0].ID != asset.ID {
		t.Fatalf("List(alice) = %#v", got)
	}
	if got := service.List("user:bob"); len(got) != 0 {
		t.Fatalf("List(bob) = %#v", got)
	}
	if _, _, err := service.Resolve("user:bob", asset.ID); !os.IsNotExist(err) {
		t.Fatalf("Resolve(cross-owner) error = %v", err)
	}
	if err := service.Delete("user:bob", asset.ID); !os.IsNotExist(err) {
		t.Fatalf("Delete(cross-owner) error = %v", err)
	}

	reloaded := NewVideoReferenceAssetService(dir, backend)
	path, _, err := reloaded.Resolve("user:alice", asset.ID)
	if err != nil {
		t.Fatalf("Resolve(reloaded) error = %v", err)
	}
	if raw, err := os.ReadFile(path); err != nil || string(raw) != "png-bytes" {
		t.Fatalf("persisted asset = %q, %v", raw, err)
	}
	if err := reloaded.Delete("user:alice", asset.ID); err != nil {
		t.Fatalf("Delete(owner) error = %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("asset file still exists, stat error = %v", err)
	}
	if got := reloaded.List("user:alice"); len(got) != 0 {
		t.Fatalf("List(after delete) = %#v", got)
	}
}

func TestVideoReferenceAssetServiceRejectsCorruptIDsAndCapsOwnerAssets(t *testing.T) {
	dir := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	service := NewVideoReferenceAssetService(dir, backend)
	if _, _, err := service.Resolve("user:alice", "../secret"); !os.IsNotExist(err) {
		t.Fatalf("Resolve(traversal) error = %v", err)
	}
	for index := 0; index < maxVideoReferenceAssetsPerOwner; index++ {
		id := fmt.Sprintf("%032x", index)
		service.items[id] = VideoReferenceAsset{ID: id, OwnerID: "user:alice"}
	}
	if _, err := service.New("user:alice", "overflow.png", "image/png", []byte{1}); err == nil {
		t.Fatal("New(overflow) succeeded")
	}
}
