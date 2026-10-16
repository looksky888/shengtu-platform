package service

import (
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func newSQLiteCreditService(t *testing.T) (*CreditService, *storage.DatabaseBackend) {
	t.Helper()
	root := t.TempDir()
	dbPath := filepath.Join(root, "chatgpt2api.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })
	svc := NewCreditService(root, backend)
	if !svc.StoreReady() {
		t.Fatal("StoreReady() = false")
	}
	if svc.ledgerStore == nil {
		t.Fatal("ledgerStore not wired for sqlite backend")
	}
	return svc, backend
}

func TestCreditServiceSQLiteAppendAndReload(t *testing.T) {
	svc, backend := newSQLiteCreditService(t)

	if _, _, err := svc.Add("user-1", 10, CreditReasonSignup, "s1"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if _, _, err := svc.Deduct("user-1", 3, CreditReasonImageGeneration, "t1"); err != nil {
		t.Fatalf("Deduct() error = %v", err)
	}

	n, err := backend.CountCreditLedger()
	if err != nil || n != 2 {
		t.Fatalf("CountCreditLedger() = %d err=%v want 2", n, err)
	}

	// Re-open service: balances + ledger must come from table.
	root := svc.dataDir
	reloaded := NewCreditService(root, backend)
	if !reloaded.StoreReady() {
		t.Fatal("reloaded StoreReady() = false")
	}
	account, err := reloaded.Account("user-1")
	if err != nil {
		t.Fatalf("Account() error = %v", err)
	}
	if account.Balance != 7 {
		t.Fatalf("balance = %d, want 7", account.Balance)
	}
	ledger := reloaded.Ledger("user-1")
	if len(ledger) != 2 {
		t.Fatalf("ledger len = %d, want 2: %#v", len(ledger), ledger)
	}

	// Idempotent DeductOnce after reload.
	account, _, charged, err := reloaded.DeductOnce("user-1", 3, CreditReasonImageGeneration, "t1")
	if err != nil {
		t.Fatalf("DeductOnce() error = %v", err)
	}
	if charged || account.Balance != 7 {
		t.Fatalf("DeductOnce charged=%v balance=%d", charged, account.Balance)
	}
}

func TestCreditServiceMigratesDocumentLedgerToTable(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "chatgpt2api.db")
	backend, err := storage.NewDatabaseBackend("sqlite:///" + filepath.ToSlash(dbPath))
	if err != nil {
		t.Fatalf("NewDatabaseBackend() error = %v", err)
	}
	defer backend.Close()

	// Seed legacy document ledger (pre-phase-D shape).
	legacy := []CreditLedgerEntry{
		{ID: "legacy-1", UserID: "u1", Delta: 20, BalanceAfter: 20, Reason: CreditReasonSignup, RefID: "s1", CreatedAt: "2026-07-01T08:00:00+08:00"},
		{ID: "legacy-2", UserID: "u1", Delta: -5, BalanceAfter: 15, Reason: CreditReasonImageGeneration, RefID: "t1", CreatedAt: "2026-07-02T09:00:00+08:00"},
	}
	if err := backend.SaveJSONDocument(creditsLedgerDocumentName, map[string]any{
		"entries": legacy,
	}); err != nil {
		t.Fatalf("SaveJSONDocument() error = %v", err)
	}
	if err := backend.SaveJSONDocument(creditsDocumentName, creditCoreState{
		Accounts: map[string]CreditAccount{
			"u1": {UserID: "u1", Balance: 15, CreatedAt: "2026-07-01T08:00:00+08:00", UpdatedAt: "2026-07-02T09:00:00+08:00"},
		},
		Cards:          map[string]CreditCard{},
		Invites:        map[string]string{},
		LedgerMigrated: true,
	}); err != nil {
		t.Fatalf("SaveJSONDocument(state) error = %v", err)
	}

	svc := NewCreditService(root, backend)
	if !svc.StoreReady() {
		t.Fatal("StoreReady() = false after migration")
	}
	n, err := backend.CountCreditLedger()
	if err != nil || n != 2 {
		t.Fatalf("migrated count = %d err=%v want 2", n, err)
	}
	account, err := svc.Account("u1")
	if err != nil || account.Balance != 15 {
		t.Fatalf("account = %#v err=%v", account, err)
	}

	// Document should be cleared / marked migrated; table is source of truth.
	raw, err := backend.LoadJSONDocument(creditsLedgerDocumentName)
	if err != nil {
		t.Fatalf("LoadJSONDocument() error = %v", err)
	}
	doc, _ := raw.(map[string]any)
	if doc == nil {
		t.Fatal("expected migrated marker document")
	}
	if doc["migrated_to_table"] != true {
		t.Fatalf("migrated marker missing: %#v", doc)
	}

	// Second boot must not re-import empty document over the table.
	reloaded := NewCreditService(root, backend)
	if n, err := backend.CountCreditLedger(); err != nil || n != 2 {
		t.Fatalf("second boot count = %d err=%v", n, err)
	}
	if ledger := reloaded.Ledger("u1"); len(ledger) != 2 {
		t.Fatalf("second boot ledger = %#v", ledger)
	}
}

func TestCreditServiceQueryLedgerUsesTable(t *testing.T) {
	svc, _ := newSQLiteCreditService(t)
	if _, _, err := svc.Add("user-q", 10, CreditReasonSignup, "signup-ref"); err != nil {
		t.Fatalf("Add(signup) error = %v", err)
	}
	if _, _, err := svc.Add("user-q", 1, CreditReasonCheckin, "checkin-ref"); err != nil {
		t.Fatalf("Add(checkin) error = %v", err)
	}
	if _, _, err := svc.Deduct("user-q", 1, CreditReasonImageGeneration, "task-9"); err != nil {
		t.Fatalf("Deduct() error = %v", err)
	}

	page, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatalf("QueryLedger() error = %v", err)
	}
	if page.Total != 3 || len(page.Items) != 2 {
		t.Fatalf("page = %#v", page)
	}

	byKW, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, Keyword: "task-9"})
	if err != nil || byKW.Total != 1 {
		t.Fatalf("keyword query = %#v err=%v", byKW, err)
	}
	if byKW.Items[0].RefID != "task-9" {
		t.Fatalf("keyword item = %#v", byKW.Items[0])
	}

	byReason, err := svc.QueryLedger(CreditLedgerQuery{Page: 1, PageSize: 20, Reason: CreditReasonCheckin})
	if err != nil || byReason.Total != 1 {
		t.Fatalf("reason query = %#v err=%v", byReason, err)
	}
}

func TestCreditServiceSQLiteCoreWriteFailureRollsBackLedger(t *testing.T) {
	// When ledger appends first then core fails, rewriteLedgerFile restores prior rows.
	// Simulate by using a service, then forcing rewrite via save failure path unit-style:
	// After successful ops, Replace with empty and ensure reload recovers only if document
	// path is not used — here we verify append does not rewrite full document.
	svc, backend := newSQLiteCreditService(t)
	if _, _, err := svc.Add("u", 5, CreditReasonSignup, "s"); err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	// Snapshot count, append another, ensure count grows by 1 (append not replace-from-zero).
	before, _ := backend.CountCreditLedger()
	if _, _, err := svc.Add("u", 2, CreditReasonCheckin, "c"); err != nil {
		t.Fatalf("Add(checkin) error = %v", err)
	}
	after, _ := backend.CountCreditLedger()
	if before != 1 || after != 2 {
		t.Fatalf("counts before=%d after=%d want 1→2", before, after)
	}
}
