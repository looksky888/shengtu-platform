package storage

import (
	"database/sql"
	"errors"
	"net/url"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

type DatabaseBackend struct {
	databaseURL string
	driver      string
	dsn         string
	db          *sql.DB
	readDB      *sql.DB
}

func NewDatabaseBackend(databaseURL string) (*DatabaseBackend, error) {
	driver, dsn, err := parseDatabaseURL(databaseURL)
	if err != nil {
		return nil, err
	}
	openDSN := dsn
	if driver == "sqlite" {
		// PRAGMA settings are per connection. database/sql opens new connections
		// over the lifetime of the pool (SetConnMaxLifetime below), so the
		// settings must travel with the DSN: a connection created later would
		// otherwise run with busy_timeout=0 and fail immediately on SQLITE_BUSY.
		openDSN = sqlitePragmaDSN(openDSN)
	}
	db, err := sql.Open(driver, openDSN)
	if err != nil {
		return nil, err
	}
	// dsn stays the bare SQLite file path: database snapshots read it as a path.
	backend := &DatabaseBackend{databaseURL: databaseURL, driver: driver, dsn: dsn, db: db}
	backend.configurePool()
	if err := backend.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if driver == "sqlite" && !isSQLiteMemoryDSN(dsn) {
		readDB, readErr := sql.Open(driver, sqliteReadOnlyPragmaDSN(dsn))
		if readErr != nil {
			_ = db.Close()
			return nil, readErr
		}
		readDB.SetConnMaxLifetime(time.Hour)
		readDB.SetMaxOpenConns(4)
		readDB.SetMaxIdleConns(2)
		backend.readDB = readDB
	}
	return backend, nil
}

// reader returns the dedicated read-only pool on file-backed SQLite (WAL allows
// concurrent readers alongside the single serialized writer) and falls back to
// db on in-memory SQLite or remote SQL drivers.
func (b *DatabaseBackend) reader() *sql.DB {
	if b != nil && b.readDB != nil {
		return b.readDB
	}
	return b.db
}

// Close releases the underlying database connection pools.
func (b *DatabaseBackend) Close() error {
	if b == nil {
		return nil
	}
	var readErr, writeErr error
	if b.readDB != nil {
		readErr = b.readDB.Close()
	}
	if b.db != nil {
		writeErr = b.db.Close()
	}
	return errors.Join(readErr, writeErr)
}

func (b *DatabaseBackend) configurePool() {
	b.db.SetConnMaxLifetime(time.Hour)
	if b.driver == "sqlite" {
		b.db.SetMaxOpenConns(1)
		b.db.SetMaxIdleConns(1)
		return
	}
	b.db.SetMaxOpenConns(10)
	b.db.SetMaxIdleConns(5)
}

func isSQLiteMemoryDSN(dsn string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(dsn))
	return trimmed == "" || trimmed == ":memory:" || strings.Contains(trimmed, "mode=memory")
}

// sqlitePragmas are connection-scoped settings every pooled writer connection needs.
// journal_mode is durable in the database file, but it is applied here too so a
// freshly created file is switched to WAL before any other statement runs.
var sqlitePragmas = []string{
	"busy_timeout(5000)",
	"foreign_keys(ON)",
	"journal_mode(WAL)",
	"synchronous(NORMAL)",
	"temp_store(MEMORY)",
}

var sqliteReadOnlyPragmas = []string{
	"busy_timeout(5000)",
	"foreign_keys(ON)",
	"query_only(ON)",
	"temp_store(MEMORY)",
}

// sqlitePragmaDSN appends the connection PRAGMAs as DSN query parameters, which
// modernc.org/sqlite replays on every connection it opens.
func sqlitePragmaDSN(dsn string) string {
	return appendSQLitePragmas(dsn, sqlitePragmas)
}

func sqliteReadOnlyPragmaDSN(dsn string) string {
	return appendSQLitePragmas(dsn, sqliteReadOnlyPragmas)
}

func appendSQLitePragmas(dsn string, pragmas []string) string {
	params := make([]string, 0, len(pragmas))
	for _, pragma := range pragmas {
		params = append(params, "_pragma="+url.QueryEscape(pragma))
	}
	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	return dsn + separator + strings.Join(params, "&")
}
