package service

import (
	"os"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestLogServiceSQLiteUsageIsIncrementalAndReloadable(t *testing.T) {
	dir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dir, "usage.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()

	logs := NewLogService(dir, backend)
	addUsageTestLog(t, logs, "user:sqlite")
	addUsageTestLog(t, logs, "user:sqlite")
	if err := logs.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, userUsageAggregateFileName)); !os.IsNotExist(err) {
		t.Fatalf("database mode wrote legacy aggregate JSON: %v", err)
	}

	rows, initialized, err := backend.LoadUserUsageAggregate()
	if err != nil || !initialized || len(rows) != 1 {
		t.Fatalf("LoadUserUsageAggregate() = rows=%#v initialized=%v err=%v", rows, initialized, err)
	}
	if rows[0].Calls != 2 || rows[0].Success != 2 || rows[0].QuotaUsed != 2 {
		t.Fatalf("aggregate row = %#v", rows[0])
	}

	reloaded := NewLogService(dir, backend)
	defer reloaded.Close()
	got := reloaded.UserUsageStatsForIDs(14, []string{"user:sqlite"})["user:sqlite"]
	if got.CallCount != 2 || got.SuccessCount != 2 || got.QuotaUsed != 2 {
		t.Fatalf("reloaded stats = %#v", got)
	}
}

func TestLogServiceSQLiteMigratesLegacyLogsOnce(t *testing.T) {
	dir := t.TempDir()
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(filepath.Join(dir, "migration.db")))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if err := backend.AppendLog(map[string]any{
		"time": util.NowLocal(), "summary": "legacy usage", "detail": usageTestDetail("user:legacy-db"),
	}); err != nil {
		t.Fatalf("AppendLog() error = %v", err)
	}

	logs := NewLogService(dir, backend)
	defer logs.Close()
	got := logs.UserUsageStatsForIDs(14, []string{"user:legacy-db"})["user:legacy-db"]
	if got.CallCount != 1 || got.QuotaUsed != 1 {
		t.Fatalf("migrated stats = %#v", got)
	}
	rows, initialized, err := backend.LoadUserUsageAggregate()
	if err != nil || !initialized || len(rows) != 1 || rows[0].Calls != 1 {
		t.Fatalf("migrated rows=%#v initialized=%v err=%v", rows, initialized, err)
	}
}
