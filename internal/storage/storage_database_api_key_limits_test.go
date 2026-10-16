package storage

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDatabaseAPIKeyLimitPersistsDailyAndReleasesConcurrency(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "limits.db")
	open := func() *DatabaseBackend {
		backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
		if err != nil {
			t.Fatalf("NewDatabaseBackend() error = %v", err)
		}
		return backend
	}
	now := time.Date(2026, 9, 7, 1, 0, 0, 0, time.UTC)
	nowText := now.Format(time.RFC3339Nano)
	backend := open()
	id, _, reason, err := backend.ReserveAPIKeyLimit("key-a", nowText, "2026-09-07", 0, 1, 2, 120)
	if err != nil || id == "" || reason != "" {
		t.Fatalf("first reserve = id %q reason %q err %v", id, reason, err)
	}
	if _, _, reason, err = backend.ReserveAPIKeyLimit("key-a", nowText, "2026-09-07", 0, 1, 2, 120); err != nil || reason != "concurrency" {
		t.Fatalf("concurrent reserve = reason %q err %v", reason, err)
	}
	if err := backend.ReleaseAPIKeyLimit(id); err != nil {
		t.Fatalf("ReleaseAPIKeyLimit() error = %v", err)
	}
	secondID, _, reason, err := backend.ReserveAPIKeyLimit("key-a", nowText, "2026-09-07", 0, 1, 2, 120)
	if err != nil || secondID == "" || reason != "" {
		t.Fatalf("second reserve = id %q reason %q err %v", secondID, reason, err)
	}
	if err := backend.ReleaseAPIKeyLimit(secondID); err != nil {
		t.Fatalf("second release error = %v", err)
	}
	if err := backend.Close(); err != nil {
		t.Fatalf("close backend error = %v", err)
	}
	reopened := open()
	defer reopened.Close()
	if _, _, reason, err = reopened.ReserveAPIKeyLimit("key-a", nowText, "2026-09-07", 0, 1, 2, 120); err != nil || reason != "daily" {
		t.Fatalf("reserve after restart = reason %q err %v", reason, err)
	}
}

func TestDatabaseStorageCapacityReservationCountsPendingAndReleases(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "capacity.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if _, err := backend.db.Exec(`INSERT INTO user_storage_entitlements (id, user_id, source_order_id, product_id, storage_bytes, expires_at, created_at, updated_at) VALUES ('ent-1','user-1', 'order-1','product-1',1000,'2099-01-01T00:00:00Z','2026-09-07T00:00:00Z','2026-09-07T00:00:00Z')`); err != nil {
		t.Fatalf("insert entitlement: %v", err)
	}
	first, limited, allowed, used, total, err := backend.ReserveStorageCapacity("user-1", "2026-09-07T01:00:00Z", 700, 60)
	if err != nil || !limited || !allowed || first == "" || used != 0 || total != 1000 {
		t.Fatalf("first storage reserve = id %q limited %v allowed %v used %d total %d err %v", first, limited, allowed, used, total, err)
	}
	second, _, allowed, _, _, err := backend.ReserveStorageCapacity("user-1", "2026-09-07T01:00:01Z", 400, 60)
	if err != nil || second != "" || allowed {
		t.Fatalf("over-capacity reserve = id %q allowed %v err %v", second, allowed, err)
	}
	if err := backend.ReleaseStorageCapacity(first); err != nil {
		t.Fatalf("release storage reserve: %v", err)
	}
	third, _, allowed, _, _, err := backend.ReserveStorageCapacity("user-1", "2026-09-07T01:00:02Z", 400, 60)
	if err != nil || third == "" || !allowed {
		t.Fatalf("reserve after release = id %q allowed %v err %v", third, allowed, err)
	}
}
