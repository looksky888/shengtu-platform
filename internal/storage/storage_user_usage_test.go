package storage

import (
	"path/filepath"
	"testing"
)

func TestDatabaseBackendUserUsageAggregateIsIncremental(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "usage.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if err := backend.ReplaceUserUsageAggregate(nil); err != nil {
		t.Fatalf("ReplaceUserUsageAggregate() error = %v", err)
	}

	row := UserUsageAggregateRow{UserID: "user-1", Day: "2026-08-05", Calls: 1, Success: 1, QuotaUsed: 2}
	item := map[string]any{"time": "2026-08-05 10:00:00", "summary": "usage"}
	if err := backend.AppendLogWithUserUsage(item, row); err != nil {
		t.Fatalf("AppendLogWithUserUsage() error = %v", err)
	}
	row.Calls, row.Success, row.QuotaUsed = 1, 1, 1
	if err := backend.AppendLogWithUserUsage(item, row); err != nil {
		t.Fatalf("second AppendLogWithUserUsage() error = %v", err)
	}

	rows, initialized, err := backend.LoadUserUsageAggregate()
	if err != nil || !initialized || len(rows) != 1 {
		t.Fatalf("LoadUserUsageAggregate() = rows=%#v initialized=%v err=%v", rows, initialized, err)
	}
	if rows[0].Calls != 2 || rows[0].Success != 2 || rows[0].QuotaUsed != 3 {
		t.Fatalf("aggregate row = %#v, want calls=2 success=2 quota=3", rows[0])
	}
	summary, err := backend.LogSummary()
	if err != nil || summary.Total != 2 {
		t.Fatalf("LogSummary() = %#v, err=%v; log and aggregate must both commit", summary, err)
	}
}

func TestDatabaseBackendUserUsageAggregateRollsBackLogOnCounterFailure(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "usage-rollback.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if _, err := backend.db.Exec("DROP TABLE user_usage_aggregate"); err != nil {
		t.Fatalf("drop aggregate table: %v", err)
	}
	err = backend.AppendLogWithUserUsage(map[string]any{"time": "2026-08-05 10:00:00"}, UserUsageAggregateRow{
		UserID: "user-1", Day: "2026-08-05", Calls: 1,
	})
	if err == nil {
		t.Fatal("AppendLogWithUserUsage() error = nil, want transaction failure")
	}
	summary, err := backend.LogSummary()
	if err != nil {
		t.Fatalf("LogSummary() error = %v", err)
	}
	if summary.Total != 0 {
		t.Fatalf("logs = %d, want 0 after aggregate failure", summary.Total)
	}
}
