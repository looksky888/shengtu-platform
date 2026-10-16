package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

const sqliteStateSchemaVersion = "1"

func isSQLiteStatePath(path string) bool {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".db", ".sqlite", ".sqlite3":
		return true
	default:
		return false
	}
}

func newSQLiteFileStore(path string) (*FileStore, error) {
	path = filepath.Clean(path)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	store := &FileStore{
		path:                       path,
		db:                         db,
		state:                      State{NextID: 1},
		messageRetentionDays:       defaultMessageRetentionDays,
		messageRetentionPerMailbox: defaultMessageRetentionPerMailbox,
	}
	if err := initSQLiteStateSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	loaded, err := store.loadSQLiteLocked()
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	if !loaded {
		legacyPath := sqliteLegacyJSONPath(path)
		legacy, found, err := readStateJSON(legacyPath)
		if err != nil {
			_ = db.Close()
			return nil, err
		}
		if found {
			store.state = legacy
			store.migrateStateLocked()
		}
		if err := store.saveSQLiteLocked(); err != nil {
			_ = db.Close()
			return nil, err
		}
	} else {
		store.rememberPersistedLocked()
	}
	return store, nil
}

func initSQLiteStateSchema(db *sql.DB) error {
	for _, stmt := range []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA synchronous=NORMAL`,
		`PRAGMA busy_timeout=5000`,
		`CREATE TABLE IF NOT EXISTS state_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS state_users (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS state_web_sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS state_accounts (
			id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, label TEXT NOT NULL, apple_id TEXT NOT NULL, data TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_state_accounts_owner ON state_accounts (owner_id, id)`,
		`CREATE TABLE IF NOT EXISTS state_mailboxes (
			id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, account_id TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
			label TEXT NOT NULL, status TEXT NOT NULL, tag TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_state_mailboxes_email ON state_mailboxes (email)`,
		`CREATE INDEX IF NOT EXISTS idx_state_mailboxes_owner_account ON state_mailboxes (owner_id, account_id, email)`,
		`CREATE INDEX IF NOT EXISTS idx_state_mailboxes_status ON state_mailboxes (owner_id, status)`,
		`CREATE TABLE IF NOT EXISTS state_messages (
			id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, mailbox_id TEXT NOT NULL, remote_id TEXT NOT NULL,
			received_at TEXT NOT NULL, data TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_state_messages_mailbox_received ON state_messages (mailbox_id, received_at DESC, id DESC)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_state_messages_remote ON state_messages (mailbox_id, remote_id) WHERE remote_id <> ''`,
		`CREATE TABLE IF NOT EXISTS state_create_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS state_icloud (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("initialize sidecar SQLite schema: %w", err)
		}
	}
	if err := validateSQLiteSchema(db); err != nil {
		return err
	}
	for _, stmt := range []string{
		`CREATE INDEX IF NOT EXISTS idx_state_accounts_owner ON state_accounts (owner_id, id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_state_mailboxes_email ON state_mailboxes (email)`,
		`CREATE INDEX IF NOT EXISTS idx_state_mailboxes_owner_account ON state_mailboxes (owner_id, account_id, email)`,
		`CREATE INDEX IF NOT EXISTS idx_state_mailboxes_status ON state_mailboxes (owner_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_state_messages_mailbox_received ON state_messages (mailbox_id, received_at DESC, id DESC)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_state_messages_remote ON state_messages (mailbox_id, remote_id) WHERE remote_id <> ''`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("initialize sidecar SQLite indexes: %w", err)
		}
	}
	return nil
}

func validateSQLiteSchema(db *sql.DB) error {
	expected := map[string][]string{
		"state_meta":            {"name", "value"},
		"state_users":           {"id", "data"},
		"state_web_sessions":    {"id", "data"},
		"state_accounts":        {"id", "owner_id", "label", "apple_id", "data"},
		"state_mailboxes":       {"id", "owner_id", "account_id", "email", "label", "status", "tag", "updated_at", "data"},
		"state_messages":        {"id", "owner_id", "mailbox_id", "remote_id", "received_at", "data"},
		"state_create_settings": {"id", "data"},
		"state_icloud":          {"id", "data"},
	}
	for table, columns := range expected {
		rows, err := db.Query("PRAGMA table_info(" + table + ")")
		if err != nil {
			return fmt.Errorf("inspect sidecar SQLite table %q: %w", table, err)
		}
		found := make(map[string]struct{}, len(columns))
		for rows.Next() {
			var cid int
			var name, columnType string
			var notNull, primaryKey int
			var defaultValue any
			if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
				_ = rows.Close()
				return fmt.Errorf("inspect sidecar SQLite table %q: %w", table, err)
			}
			found[name] = struct{}{}
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return fmt.Errorf("inspect sidecar SQLite table %q: %w", table, err)
		}
		_ = rows.Close()
		for _, column := range columns {
			if _, ok := found[column]; !ok {
				return fmt.Errorf("unsupported sidecar SQLite schema: table %q missing column %q; backup state JSON and recreate database before retrying", table, column)
			}
		}
	}
	return nil
}

func sqliteLegacyJSONPath(path string) string {
	ext := filepath.Ext(path)
	if ext == "" {
		return path + ".json"
	}
	return strings.TrimSuffix(path, ext) + ".json"
}

func readStateJSON(path string) (State, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return State{NextID: 1}, false, nil
		}
		return State{}, false, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return State{NextID: 1}, true, nil
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, true, err
	}
	if state.NextID <= 0 {
		state.NextID = 1
	}
	return state, true, nil
}

func (s *FileStore) migrateStateLocked() {
	_ = s.migrateLegacyICloudSessionToAdminLocked()
	_ = s.migrateLegacyICloudSessionAccountIDsLocked()
	_ = s.migrateLegacyMailboxAccountIDsLocked()
	_ = s.migrateLegacyMailboxClaimsLocked()
}

func (s *FileStore) loadSQLiteLocked() (bool, error) {
	var marker string
	err := s.db.QueryRow(`SELECT value FROM state_meta WHERE name = 'schema_version'`).Scan(&marker)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if marker != sqliteStateSchemaVersion {
		return false, fmt.Errorf("unsupported sidecar SQLite schema version %q", marker)
	}
	state, err := loadSQLiteStateRows(s.db)
	if err != nil {
		return false, err
	}
	s.state = state
	if s.state.NextID <= 0 {
		s.state.NextID = 1
	}
	return true, nil
}

func (s *FileStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	if s.closed {
		return nil
	}
	s.closed = true
	err := s.db.Close()
	return err
}
