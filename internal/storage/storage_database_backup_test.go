package storage

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestDatabaseSnapshotRejectsNonSQLiteBackend(t *testing.T) {
	db, err := sql.Open("postgres", "postgres://invalid")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer db.Close()
	backend := &DatabaseBackend{driver: "postgres", db: db}
	err = backend.CreateDatabaseSnapshot(context.Background(), "unused")
	if err == nil || !strings.Contains(err.Error(), "暂不支持内置完整备份") {
		t.Fatalf("CreateDatabaseSnapshot() error = %v", err)
	}
}
