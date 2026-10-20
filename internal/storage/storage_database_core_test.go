package storage

import (
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestSQLitePragmasSurviveConnectionRecycling pins the audit finding that the
// one-shot PRAGMA setup only configured the first pooled connection: after the
// one-hour SetConnMaxLifetime the pool replaced it and busy_timeout fell back to
// 0, turning ordinary write contention into "database is locked".
func TestSQLitePragmasSurviveConnectionRecycling(t *testing.T) {
	backend := openPaymentSchemaTestBackend(t)
	defer backend.Close()

	// Every connection is immediately stale, so each query below is served by a
	// freshly opened connection — the state production reaches after one hour.
	backend.db.SetConnMaxLifetime(time.Nanosecond)
	for _, tc := range []struct {
		pragma string
		want   int
	}{
		{pragma: "busy_timeout", want: 5000},
		{pragma: "foreign_keys", want: 1},
		{pragma: "temp_store", want: 2},
	} {
		var got int
		if err := backend.db.QueryRow(`PRAGMA ` + tc.pragma).Scan(&got); err != nil {
			t.Fatalf("PRAGMA %s: %v", tc.pragma, err)
		}
		if got != tc.want {
			t.Fatalf("PRAGMA %s = %d on a recycled connection, want %d", tc.pragma, got, tc.want)
		}
	}
	var journalMode string
	if err := backend.db.QueryRow(`PRAGMA journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("PRAGMA journal_mode = %q on a recycled connection, want wal", journalMode)
	}
}

func TestSQLitePragmaDSNCarriesEveryConnectionSetting(t *testing.T) {
	dsn := sqlitePragmaDSN(filepath.Join("data", "app.db"))
	if !strings.Contains(dsn, "?") {
		t.Fatalf("sqlitePragmaDSN() = %q, want query parameters", dsn)
	}
	for _, pragma := range sqlitePragmas {
		if !strings.Contains(dsn, "_pragma="+url.QueryEscape(pragma)) {
			t.Fatalf("sqlitePragmaDSN() = %q, missing %q", dsn, pragma)
		}
	}
	// A DSN that already carries parameters must keep them.
	tagged := sqlitePragmaDSN("file:app.db?cache=shared")
	if !strings.Contains(tagged, "?cache=shared&_pragma=") {
		t.Fatalf("sqlitePragmaDSN() = %q, want the existing parameters preserved", tagged)
	}
}

// TestSQLiteBackendKeepsTheBareFilePathAsDSN guards the snapshot path: the DSN
// stored on the backend is copied as a file, so it must not gain query
// parameters.
func TestSQLiteBackendKeepsTheBareFilePathAsDSN(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "snapshot.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()
	if strings.Contains(backend.dsn, "?") {
		t.Fatalf("backend.dsn = %q, want a bare file path", backend.dsn)
	}
	files := backend.DatabaseSnapshotSourceFiles()
	if len(files) != 3 || files[0] != backend.dsn {
		t.Fatalf("DatabaseSnapshotSourceFiles() = %v, want the database file first", files)
	}
}
