package storage

import (
	"database/sql"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
	"time"
)

type DatabaseBackend struct {
	databaseURL string
	driver      string
	dsn         string
	db          *sql.DB
}

func NewDatabaseBackend(databaseURL string) (*DatabaseBackend, error) {
	driver, dsn, err := parseDatabaseURL(databaseURL)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	backend := &DatabaseBackend{databaseURL: databaseURL, driver: driver, dsn: dsn, db: db}
	backend.configurePool()
	if err := backend.configureSQLite(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := backend.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return backend, nil
}

// Close releases the underlying database connection pool.
func (b *DatabaseBackend) Close() error {
	if b == nil || b.db == nil {
		return nil
	}
	return b.db.Close()
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

func (b *DatabaseBackend) configureSQLite() error {
	if b.driver != "sqlite" {
		return nil
	}
	for _, stmt := range []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA synchronous=NORMAL`,
		`PRAGMA busy_timeout=5000`,
		`PRAGMA temp_store=MEMORY`,
		`PRAGMA foreign_keys=ON`,
	} {
		if _, err := b.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
