package storage

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
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

func TestDatabaseSnapshotUsesDedicatedConnectionWithoutBlockingWriter(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "live.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()

	if err := backend.SaveJSONDocument("settings/snapshot-probe.json", map[string]any{"version": 1}); err != nil {
		t.Fatalf("SaveJSONDocument() error = %v", err)
	}

	// Hold the single writer connection via sql.Conn while CreateDatabaseSnapshot runs.
	writerConn, err := backend.db.Conn(context.Background())
	if err != nil {
		t.Fatalf("backend.db.Conn() error = %v", err)
	}
	defer writerConn.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	target := filepath.Join(dir, "backup", "snapshot.db")
	if err := backend.CreateDatabaseSnapshot(ctx, target); err != nil {
		t.Fatalf("CreateDatabaseSnapshot() while writer conn checked out failed: %v", err)
	}

	restored, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(target))
	if err != nil {
		t.Fatalf("open snapshot db: %v", err)
	}
	defer restored.Close()
	doc, err := restored.LoadJSONDocument("settings/snapshot-probe.json")
	if err != nil {
		t.Fatalf("LoadJSONDocument() from snapshot: %v", err)
	}
	m, _ := doc.(map[string]any)
	if fmt.Sprint(m["version"]) != "1" {
		t.Fatalf("snapshot document = %#v, want version=1", doc)
	}
}
