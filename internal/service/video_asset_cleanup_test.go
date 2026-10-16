package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestVideoAssetCleanupRemovesExpiredFileAndIndex(t *testing.T) {
	root := t.TempDir()
	s := NewVideoAssetService(root)
	old := VideoAsset{TaskID: "old", OwnerID: "user", CreatedAt: time.Now().Add(-48 * time.Hour).Format(time.RFC3339)}
	recent := VideoAsset{TaskID: "recent", OwnerID: "user", CreatedAt: time.Now().Add(-12 * time.Hour).Format(time.RFC3339)}
	path := s.ContentPath(old.OwnerID, old.TaskID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Record(old); err != nil {
		t.Fatal(err)
	}
	recentPath := s.ContentPath(recent.OwnerID, recent.TaskID)
	if err := os.WriteFile(recentPath, []byte("recent"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Record(recent); err != nil {
		t.Fatal(err)
	}
	removed, err := s.CleanupOldVideos(1)
	if err != nil || removed != 1 {
		t.Fatalf("CleanupOldVideos() = %d, %v", removed, err)
	}
	if _, ok := s.Find(VideoAssetID("user", "old"), VideoAssetScope{OwnerID: "user", Kind: VideoAssetScopeMine}); ok {
		t.Fatal("expired video remains indexed")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expired video remains on disk: %v", err)
	}
	if _, ok := s.Find(VideoAssetID("user", "recent"), VideoAssetScope{OwnerID: "user", Kind: VideoAssetScopeMine}); !ok {
		t.Fatal("recent video was removed from index")
	}
	if _, err := os.Stat(recentPath); err != nil {
		t.Fatalf("recent video was removed from disk: %v", err)
	}
}
