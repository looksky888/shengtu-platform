package storage

import (
	"path/filepath"
	"testing"
)

func newMediaTestBackend(t *testing.T) *DatabaseBackend {
	t.Helper()
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(t.TempDir(), "media.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	return backend
}

func saveMediaTestAsset(t *testing.T, backend *DatabaseBackend, path, owner, visibility, createdAt string) {
	t.Helper()
	err := backend.SaveMediaAsset(MediaAssetRecord{
		ID: path, Path: path, OwnerID: owner, MediaType: "image", ObjectKey: "objects/" + path,
		ContentType: "image/png", Visibility: visibility, Status: "ready", CreatedAt: createdAt, UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatalf("SaveMediaAsset(%q) error = %v", path, err)
	}
}

func TestDatabaseMediaAssetsFilterByChinaCalendarDay(t *testing.T) {
	backend := newMediaTestBackend(t)
	saveMediaTestAsset(t, backend, "before.png", "alice", "private", "2026-08-13T23:59:59+08:00")
	saveMediaTestAsset(t, backend, "start.png", "alice", "private", "2026-08-14T00:00:00+08:00")
	saveMediaTestAsset(t, backend, "end.png", "alice", "private", "2026-08-14T23:59:59+08:00")
	saveMediaTestAsset(t, backend, "after.png", "alice", "private", "2026-08-15T00:00:00+08:00")

	page, err := backend.ListMediaAssets(MediaAssetListQuery{OwnerID: "alice", StartDate: "2026-08-14", EndDate: "2026-08-14", Limit: 20})
	if err != nil {
		t.Fatalf("ListMediaAssets() error = %v", err)
	}
	if page.Total != 2 || len(page.Items) != 2 {
		t.Fatalf("day page = total %d items %#v, want 2", page.Total, page.Items)
	}
}

func TestDatabaseMediaAssetsCursorPaginationAndScope(t *testing.T) {
	backend := newMediaTestBackend(t)
	saveMediaTestAsset(t, backend, "c.png", "alice", "private", "2026-08-14T12:00:03+08:00")
	saveMediaTestAsset(t, backend, "b.png", "alice", "public", "2026-08-14T12:00:02+08:00")
	saveMediaTestAsset(t, backend, "a.png", "bob", "public", "2026-08-14T12:00:01+08:00")

	first, err := backend.ListMediaAssets(MediaAssetListQuery{All: true, Limit: 2})
	if err != nil {
		t.Fatalf("first page error = %v", err)
	}
	if first.Total != 3 || !first.HasMore || len(first.Items) != 2 {
		t.Fatalf("first page = %#v", first)
	}
	second, err := backend.ListMediaAssets(MediaAssetListQuery{All: true, Limit: 2, BeforeSortKey: first.Items[1].CreatedAt, BeforePath: first.Items[1].Path})
	if err != nil {
		t.Fatalf("second page error = %v", err)
	}
	if len(second.Items) != 1 || second.Items[0].Path != "a.png" {
		t.Fatalf("second page = %#v", second.Items)
	}
	publicPage, err := backend.ListMediaAssets(MediaAssetListQuery{Public: true, Limit: 20})
	if err != nil {
		t.Fatalf("public page error = %v", err)
	}
	if publicPage.Total != 2 {
		t.Fatalf("public total = %d, want 2", publicPage.Total)
	}
}

func TestDatabaseMediaAssetsIncludePendingUploads(t *testing.T) {
	backend := newMediaTestBackend(t)
	asset := MediaAssetRecord{
		ID: "pending", Path: "pending.png", OwnerID: "alice", MediaType: "image", ObjectKey: "objects/pending.png",
		ContentType: "image/png", Visibility: "private", Status: "pending", CreatedAt: "2026-08-14T12:00:00+08:00", UpdatedAt: "2026-08-14T12:00:00+08:00",
	}
	if err := backend.SaveMediaAsset(asset); err != nil {
		t.Fatalf("SaveMediaAsset() error = %v", err)
	}
	page, err := backend.ListMediaAssets(MediaAssetListQuery{OwnerID: "alice", Limit: 20})
	if err != nil {
		t.Fatalf("ListMediaAssets() error = %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].Status != "pending" {
		t.Fatalf("pending page = %#v", page)
	}
}

func TestListMediaAssetsBeforeExcludesMediaCreatedBeforePolicy(t *testing.T) {
	backend := newMediaTestBackend(t)
	saveMediaTestAsset(t, backend, "historical.png", "alice", "private", "2026-08-01T00:00:00Z")
	saveMediaTestAsset(t, backend, "expired-a.png", "alice", "private", "2026-08-11T00:00:00Z")
	saveMediaTestAsset(t, backend, "expired-b.png", "bob", "private", "2026-08-11T00:00:00Z")
	saveMediaTestAsset(t, backend, "fresh.png", "alice", "private", "2026-08-20T00:00:00Z")

	first, err := backend.ListMediaAssetsBefore("2026-08-10T00:00:00Z", "2026-08-15T00:00:00Z", 1, "", "")
	if err != nil {
		t.Fatalf("ListMediaAssetsBefore() first page error = %v", err)
	}
	if len(first) != 1 || first[0].Path != "expired-a.png" {
		t.Fatalf("first page = %#v", first)
	}
	second, err := backend.ListMediaAssetsBefore("2026-08-10T00:00:00Z", "2026-08-15T00:00:00Z", 1, first[0].CreatedAt, first[0].Path)
	if err != nil {
		t.Fatalf("ListMediaAssetsBefore() second page error = %v", err)
	}
	if len(second) != 1 || second[0].Path != "expired-b.png" {
		t.Fatalf("second page = %#v", second)
	}
}
