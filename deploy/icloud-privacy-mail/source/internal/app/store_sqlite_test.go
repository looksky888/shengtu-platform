package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestSQLiteStoreMigratesLegacyJSONAndReloads(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, "state.json")
	legacy, err := NewFileStore(legacyPath)
	if err != nil {
		t.Fatalf("NewFileStore(legacy) error = %v", err)
	}
	user, err := legacy.CreateUser("alice", "password-123")
	if err != nil {
		t.Fatalf("CreateUser() error = %v", err)
	}
	account, err := legacy.AddAccountForOwner(user.ID, "primary", "alice@icloud.com", "note")
	if err != nil {
		t.Fatalf("AddAccountForOwner() error = %v", err)
	}
	mailbox, err := legacy.AddMailboxForOwner(user.ID, account.ID, "work", "alias@icloud.com")
	if err != nil {
		t.Fatalf("AddMailboxForOwner() error = %v", err)
	}
	if _, err := legacy.AddMessage(mailbox.ID, "code", "noreply@example.test", "123456", time.Now()); err != nil {
		t.Fatalf("AddMessage() error = %v", err)
	}
	if _, err := legacy.SetMailboxTag(mailbox.ID, "GPT 已注册", "red"); err != nil {
		t.Fatalf("SetMailboxTag() error = %v", err)
	}
	want := legacy.Snapshot()

	databasePath := filepath.Join(dir, "state.db")
	migrated, err := NewFileStore(databasePath)
	if err != nil {
		t.Fatalf("NewFileStore(database) error = %v", err)
	}
	t.Cleanup(func() { _ = migrated.Close() })
	assertStateJSONEqual(t, migrated.Snapshot(), want)
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("legacy JSON should remain as rollback copy: %v", err)
	}
	if err := migrated.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	reloaded, err := NewFileStore(databasePath)
	if err != nil {
		t.Fatalf("reload database error = %v", err)
	}
	defer reloaded.Close()
	assertStateJSONEqual(t, reloaded.Snapshot(), want)
}

func TestSQLiteStoreWritesOnlyChangedRows(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "state.db")
	store, err := NewFileStore(databasePath)
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	defer store.Close()
	account, err := store.AddAccount("primary", "alice@icloud.com", "")
	if err != nil {
		t.Fatalf("AddAccount() error = %v", err)
	}
	mailbox, err := store.AddMailbox(account.ID, "work", "alias@icloud.com")
	if err != nil {
		t.Fatalf("AddMailbox() error = %v", err)
	}
	if _, err := store.AddMessage(mailbox.ID, "code", "noreply@example.test", "123456", time.Now()); err != nil {
		t.Fatalf("AddMessage() error = %v", err)
	}
	if _, err := store.db.Exec(`CREATE TABLE audit (table_name TEXT NOT NULL)`); err != nil {
		t.Fatalf("create audit table: %v", err)
	}
	if _, err := store.db.Exec(`CREATE TRIGGER audit_mailbox_update AFTER UPDATE ON state_mailboxes BEGIN INSERT INTO audit(table_name) VALUES ('mailbox'); END`); err != nil {
		t.Fatalf("create audit trigger: %v", err)
	}
	if _, err := store.SetMailboxTag(mailbox.ID, "GPT 已注册", "red"); err != nil {
		t.Fatalf("SetMailboxTag() error = %v", err)
	}
	var updates int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM audit WHERE table_name = 'mailbox'`).Scan(&updates); err != nil {
		t.Fatalf("audit query: %v", err)
	}
	if updates != 1 {
		t.Fatalf("mailbox row updates = %d, want 1", updates)
	}
}

func TestSQLiteStoreRollbackOnDatabaseFailure(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "state.db")
	store, err := NewFileStore(databasePath)
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	account, err := store.AddAccount("primary", "alice@icloud.com", "")
	if err != nil {
		t.Fatalf("AddAccount() error = %v", err)
	}
	mailbox, err := store.AddMailbox(account.ID, "work", "alias@icloud.com")
	if err != nil {
		t.Fatalf("AddMailbox() error = %v", err)
	}
	before := store.Snapshot()
	if err := store.db.Close(); err != nil {
		t.Fatalf("close raw db: %v", err)
	}
	if _, err := store.SetMailboxTag(mailbox.ID, "unused", "red"); err == nil {
		t.Fatal("SetMailboxTag() error = nil, want closed database failure")
	}
	if got := store.Snapshot(); !reflect.DeepEqual(got, before) {
		t.Fatalf("state changed after failed write: got=%#v want=%#v", got, before)
	}
}

func TestSQLiteStateRowsRemainJSONDecodable(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "state.db")
	store, err := NewFileStore(databasePath)
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	defer store.Close()
	var data string
	if err := store.db.QueryRow(`SELECT value FROM state_meta WHERE name = 'schema_version'`).Scan(&data); err != nil {
		t.Fatalf("schema marker query: %v", err)
	}
	if data != "1" {
		t.Fatalf("schema marker = %q, want 1", data)
	}
	encoded, err := json.Marshal(store.Snapshot())
	if err != nil {
		t.Fatalf("state marshal: %v", err)
	}
	if len(encoded) == 0 {
		t.Fatal("empty state JSON")
	}
}

func TestSQLiteStoreRejectsDuplicateMailboxEmails(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, "state.json")
	legacy := State{
		NextID: 3,
		Mailboxes: []Mailbox{
			{ID: "mbx-1", Email: "same@example.com"},
			{ID: "mbx-2", Email: "SAME@example.com"},
		},
	}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy state: %v", err)
	}
	if err := os.WriteFile(legacyPath, data, 0o600); err != nil {
		t.Fatalf("write legacy state: %v", err)
	}
	_, err = NewFileStore(filepath.Join(dir, "state.db"))
	if err == nil || !strings.Contains(err.Error(), "duplicate mailbox email") {
		t.Fatalf("NewFileStore() error = %v, want duplicate mailbox email error", err)
	}
}

func TestSetPathRejectsSQLiteRuntimeSwitch(t *testing.T) {
	jsonStore, err := NewFileStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("NewFileStore(json) error = %v", err)
	}
	defer jsonStore.Close()
	if _, err := jsonStore.SetPath(filepath.Join(t.TempDir(), "state.db")); err == nil {
		t.Fatal("JSON SetPath(SQLite) error = nil")
	}

	sqliteStore, err := NewFileStore(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("NewFileStore(sqlite) error = %v", err)
	}
	defer sqliteStore.Close()
	if _, err := sqliteStore.SetPath(filepath.Join(t.TempDir(), "state.json")); err == nil {
		t.Fatal("SQLite SetPath(JSON) error = nil")
	}
}

func TestSQLiteStoreRejectsWritesAfterClose(t *testing.T) {
	store, err := NewFileStore(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("NewFileStore() error = %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := store.AddAccount("closed", "closed@example.com", ""); err == nil {
		t.Fatal("AddAccount() error = nil after Close()")
	}
}

func assertStateJSONEqual(t *testing.T, got, want State) {
	t.Helper()
	gotJSON, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal got state: %v", err)
	}
	wantJSON, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal want state: %v", err)
	}
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("state JSON differs: got=%s want=%s", gotJSON, wantJSON)
	}
}
