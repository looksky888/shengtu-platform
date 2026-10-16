package storage

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

func TestIsMySQLDuplicateIndexError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "duplicate index", err: &mysqlDriver.MySQLError{Number: 1061}, want: true},
		{name: "permission denied", err: &mysqlDriver.MySQLError{Number: 1142}, want: false},
		{name: "wrapped duplicate", err: fmt.Errorf("create index: %w", &mysqlDriver.MySQLError{Number: 1061}), want: true},
		{name: "other driver", err: fmt.Errorf("duplicate index"), want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMySQLDuplicateIndexError(tt.err); got != tt.want {
				t.Fatalf("isMySQLDuplicateIndexError() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMySQLSchemaUsesIndexableUniqueColumns(t *testing.T) {
	text := strings.Join(mysqlSchemaStatements(), "\n")
	for _, want := range []string{
		"access_token VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NOT NULL",
		"key_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE NOT NULL",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("MySQL schema missing %q", want)
		}
	}
	for _, forbidden := range []string{"access_token TEXT UNIQUE", "key_id TEXT UNIQUE"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("MySQL schema contains non-indexable declaration %q", forbidden)
		}
	}
}

func TestDatabaseBackendDeleteAccountDoesNotWipeUnrelatedRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "del.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	if err := backend.SaveAccounts([]map[string]any{
		{"access_token": "token-a", "quota": 1},
		{"access_token": "token-b", "quota": 2},
	}); err != nil {
		t.Fatalf("SaveAccounts() error = %v", err)
	}
	if err := backend.DeleteAccount("token-a"); err != nil {
		t.Fatalf("DeleteAccount() error = %v", err)
	}
	accounts, err := backend.LoadAccounts()
	if err != nil {
		t.Fatalf("LoadAccounts() error = %v", err)
	}
	if len(accounts) != 1 || fmt.Sprint(accounts[0]["access_token"]) != "token-b" {
		t.Fatalf("after delete LoadAccounts() = %#v", accounts)
	}
}

func TestDatabaseBackendUpsertDoesNotWipeUnrelatedRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "upsert.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	if err := backend.SaveAccounts([]map[string]any{
		{"access_token": "token-a", "quota": 1},
		{"access_token": "token-b", "quota": 2},
	}); err != nil {
		t.Fatalf("SaveAccounts() error = %v", err)
	}
	if err := backend.UpsertAccount("token-a", map[string]any{"access_token": "token-a", "quota": 9}); err != nil {
		t.Fatalf("UpsertAccount() error = %v", err)
	}
	accounts, err := backend.LoadAccounts()
	if err != nil {
		t.Fatalf("LoadAccounts() error = %v", err)
	}
	if len(accounts) != 2 {
		t.Fatalf("LoadAccounts() len = %d, want 2: %#v", len(accounts), accounts)
	}
	byToken := map[string]map[string]any{}
	for _, item := range accounts {
		byToken[fmt.Sprint(item["access_token"])] = item
	}
	if fmt.Sprint(byToken["token-a"]["quota"]) != "9" {
		t.Fatalf("token-a quota = %#v, want 9", byToken["token-a"]["quota"])
	}
	if fmt.Sprint(byToken["token-b"]["quota"]) != "2" {
		t.Fatalf("token-b should remain: %#v", byToken["token-b"])
	}

	// SaveAccounts with one item should delete the orphan.
	if err := backend.SaveAccounts([]map[string]any{{"access_token": "token-a", "quota": 1}}); err != nil {
		t.Fatalf("SaveAccounts(trim) error = %v", err)
	}
	accounts, err = backend.LoadAccounts()
	if err != nil {
		t.Fatalf("LoadAccounts() after trim error = %v", err)
	}
	if len(accounts) != 1 || fmt.Sprint(accounts[0]["access_token"]) != "token-a" {
		t.Fatalf("after trim LoadAccounts() = %#v", accounts)
	}
}

func TestDatabaseBackendBatchUpsertRollsBackOnLaterMarshalFailure(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "batch-upsert.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	err = backend.UpsertAccountsBatch([]AccountMutation{
		{AccessToken: "token-a", Data: map[string]any{"access_token": "token-a", "quota": 1}},
		{AccessToken: "token-b", Data: map[string]any{"access_token": "token-b", "invalid": make(chan int)}},
	})
	if err == nil {
		t.Fatal("UpsertAccountsBatch() succeeded, want marshal failure")
	}
	accounts, loadErr := backend.LoadAccounts()
	if loadErr != nil {
		t.Fatalf("LoadAccounts() error = %v", loadErr)
	}
	if len(accounts) != 0 {
		t.Fatalf("partial batch was committed: %#v", accounts)
	}
}

func TestDatabaseBackendBatchDeleteRollsBackOnLaterDeleteFailure(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "batch-delete.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()
	if err := backend.SaveAccounts([]map[string]any{
		{"access_token": "token-a", "quota": 1},
		{"access_token": "token-b", "quota": 2},
	}); err != nil {
		t.Fatalf("SaveAccounts() error = %v", err)
	}
	if _, err := backend.db.Exec(`CREATE TRIGGER fail_token_b_delete BEFORE DELETE ON accounts
		WHEN OLD.access_token = 'token-b' BEGIN SELECT RAISE(ABORT, 'forced delete failure'); END`); err != nil {
		t.Fatalf("create trigger: %v", err)
	}

	err = backend.DeleteAccountsBatch([]string{"token-a", "token-b"})
	if err == nil {
		t.Fatal("DeleteAccountsBatch() succeeded, want trigger failure")
	}
	accounts, loadErr := backend.LoadAccounts()
	if loadErr != nil {
		t.Fatalf("LoadAccounts() error = %v", loadErr)
	}
	if len(accounts) != 2 {
		t.Fatalf("partial batch delete was committed: %#v", accounts)
	}
}

func TestDatabaseBackendStoresDocumentsAndLogs(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "chatgpt2api.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	if err := backend.SaveAccounts([]map[string]any{{"access_token": "token-1", "type": "Plus"}}); err != nil {
		t.Fatalf("SaveAccounts() error = %v", err)
	}
	if err := backend.SaveAuthKeys([]map[string]any{{"id": "key-1", "key": "sk-test"}}); err != nil {
		t.Fatalf("SaveAuthKeys() error = %v", err)
	}
	if err := backend.SaveJSONDocument("announcements.json", []map[string]any{{"id": "a1", "content": "hello"}}); err != nil {
		t.Fatalf("SaveJSONDocument() error = %v", err)
	}
	if err := backend.AppendLog(map[string]any{
		"time":    "2026-04-30 10:00:00",
		"type":    "event",
		"summary": "ok",
		"detail":  map[string]any{"status": "success"},
	}); err != nil {
		t.Fatalf("AppendLog() error = %v", err)
	}
	if err := backend.AppendLog(map[string]any{
		"time":    "2026-04-29 10:00:00",
		"type":    "event",
		"summary": "skip",
	}); err != nil {
		t.Fatalf("AppendLog() error = %v", err)
	}

	accounts, err := backend.LoadAccounts()
	if err != nil {
		t.Fatalf("LoadAccounts() error = %v", err)
	}
	if len(accounts) != 1 || accounts[0]["access_token"] != "token-1" {
		t.Fatalf("LoadAccounts() = %#v", accounts)
	}

	doc, err := backend.LoadJSONDocument("announcements.json")
	if err != nil {
		t.Fatalf("LoadJSONDocument() error = %v", err)
	}
	items, ok := doc.([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("LoadJSONDocument() = %#v", doc)
	}

	logs, err := backend.QueryLogs("2026-04-30", "2026-04-30", 10)
	if err != nil {
		t.Fatalf("QueryLogs() error = %v", err)
	}
	if len(logs) != 1 || logs[0]["summary"] != "ok" {
		t.Fatalf("QueryLogs() = %#v", logs)
	}

	health := backend.HealthCheck()
	if health.DocumentCount == nil || *health.DocumentCount != 1 || health.LogCount == nil || *health.LogCount != 2 {
		t.Fatalf("HealthCheck() = %#v", health)
	}
}

func TestDatabaseBackendHealthFailsWhenCountQueryFails(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "health.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()
	if _, err := backend.db.Exec("DROP TABLE logs"); err != nil {
		t.Fatal(err)
	}

	health := backend.HealthCheck()
	if health.Status != "unhealthy" || !strings.Contains(health.Error, "count logs") {
		t.Fatalf("HealthCheck() = %#v", health)
	}
	if health.LogCount != nil {
		t.Fatalf("failed count returned log_count = %v", *health.LogCount)
	}
}

func TestDatabaseBackendQueryLogsEmptyReturnsJSONArray(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "chatgpt2api.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	logs, err := backend.QueryLogs("2026-04-30", "2026-04-30", 10)
	if err != nil {
		t.Fatalf("QueryLogs() error = %v", err)
	}
	if logs == nil {
		t.Fatal("QueryLogs() returned nil slice, want empty slice")
	}
	data, err := json.Marshal(map[string]any{"items": logs})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if string(data) != `{"items":[]}` {
		t.Fatalf("marshaled logs = %s, want {\"items\":[]}", data)
	}
}

func TestDatabaseBackendDeletesLogsBeforeDay(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "chatgpt2api.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	for _, item := range []map[string]any{
		{"time": "2026-04-28 10:00:00", "type": "event", "summary": "old"},
		{"time": "2026-04-29 10:00:00", "type": "event", "summary": "cutoff"},
		{"time": "2026-04-30 10:00:00", "type": "event", "summary": "new"},
	} {
		if err := backend.AppendLog(item); err != nil {
			t.Fatalf("AppendLog() error = %v", err)
		}
	}

	deleted, err := backend.DeleteLogsBefore("2026-04-29")
	if err != nil {
		t.Fatalf("DeleteLogsBefore() error = %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteLogsBefore() deleted = %d, want 1", deleted)
	}
	logs, err := backend.QueryLogs("", "", 0)
	if err != nil {
		t.Fatalf("QueryLogs() error = %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("remaining logs = %#v, want 2", logs)
	}
}

func TestJSONBackendDeletesLogsBeforeDay(t *testing.T) {
	dir := t.TempDir()
	backend := NewJSONBackend(filepath.Join(dir, "accounts.json"), filepath.Join(dir, "auth_keys.json"))
	for _, item := range []map[string]any{
		{"time": "2026-04-28 10:00:00", "type": "event", "summary": "old"},
		{"time": "2026-04-29 10:00:00", "type": "event", "summary": "cutoff"},
		{"time": "2026-04-30 10:00:00", "type": "event", "summary": "new"},
	} {
		if err := backend.AppendLog(item); err != nil {
			t.Fatalf("AppendLog() error = %v", err)
		}
	}

	deleted, err := backend.DeleteLogsBefore("2026-04-29")
	if err != nil {
		t.Fatalf("DeleteLogsBefore() error = %v", err)
	}
	if deleted != 1 {
		t.Fatalf("DeleteLogsBefore() deleted = %d, want 1", deleted)
	}
	logs, err := backend.QueryLogs("", "", 0)
	if err != nil {
		t.Fatalf("QueryLogs() error = %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("remaining logs = %#v, want 2", logs)
	}
}

func TestNewBackendFromEnvDefaultsToSQLiteProjectDatabase(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("STORAGE_BACKEND", "")
	t.Setenv("DATABASE_URL", "")

	backend, err := NewBackendFromEnv(dir)
	if err != nil {
		t.Fatalf("NewBackendFromEnv() error = %v", err)
	}
	database, ok := backend.(*DatabaseBackend)
	if !ok {
		t.Fatalf("NewBackendFromEnv() returned %T, want *DatabaseBackend", backend)
	}
	defer database.db.Close()
	if database.driver != "sqlite" {
		t.Fatalf("driver = %q, want sqlite", database.driver)
	}
	want := filepath.ToSlash(filepath.Join(dir, "chatgpt2api.db"))
	if database.dsn != want {
		t.Fatalf("dsn = %q, want %q", database.dsn, want)
	}
}

func TestDocumentNameValidation(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "chatgpt2api.db")
	backend, err := NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.db.Close()

	for _, name := range []string{"../x.json", "/x.json", "a/../x.json", "C:/x.json"} {
		t.Run(name, func(t *testing.T) {
			if err := backend.SaveJSONDocument(name, map[string]any{}); err == nil {
				t.Fatalf("SaveJSONDocument(%q) succeeded, want error", name)
			}
		})
	}
}
